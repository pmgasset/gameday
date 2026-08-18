import { createClient } from "npm:@supabase/supabase-js@2";

type RemoteGame = {
  id: number; date: string; status: string; period?: number; time?: string;
  home_team_score?: number; visitor_team_score?: number;
  season: number; week: number; home_team: { id: number }; visitor_team: { id: number };
};
type LocalGame = { id: string; provider_game_id: string; manual_override: boolean };
type RemoteTeam = { id: number; abbreviation: string; city: string; name: string; conference?: string; division?: string };
type OpenWeek = { nfl_week: number; seasons: { nfl_season: number; pool_id: string } | null };
type SyncRequest = { poolId?: string; week?: number; source?: string };

function configuredSecretKey(): string | undefined {
  const named = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (named) return (JSON.parse(named) as Record<string, string>).default;
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // local/legacy fallback
}
function normalizeStatus(raw: string): "scheduled" | "in_progress" | "final" | "postponed" | "cancelled" {
  const value = raw.toLowerCase();
  if (value.includes("final")) return "final";
  if (value.includes("postpon")) return "postponed";
  if (value.includes("cancel")) return "cancelled";
  return /q[1-4]|half|live|in progress/.test(value) ? "in_progress" : "scheduled";
}

async function importOpenWeekSchedule(database: ReturnType<typeof createClient>, providerKey: string, poolId?: string, requestedWeek?: number): Promise<void> {
  let weeksQuery = database.from("weeks").select("nfl_week,seasons!inner(nfl_season,is_active,pool_id)").eq("seasons.is_active", true).eq("status", "open");
  if (poolId) weeksQuery = weeksQuery.eq("seasons.pool_id", poolId);
  if (requestedWeek) weeksQuery = weeksQuery.eq("nfl_week", requestedWeek);
  const { data: weekData, error: weekError } = await weeksQuery;
  if (weekError) throw weekError;
  const weeks = (weekData ?? []) as unknown as OpenWeek[];
  if (!weeks.length) return;
  const teamResponse = await fetch("https://api.balldontlie.io/nfl/v1/teams?per_page=100", { headers: { Authorization: providerKey } });
  if (!teamResponse.ok) throw new Error(`BALLDONTLIE ${teamResponse.status}`);
  const teams = (await teamResponse.json() as { data: RemoteTeam[] }).data;
  const teamMap = new Map<number, string>();
  for (const team of teams) {
    const { data, error } = await database.from("teams").upsert({ provider: "balldontlie", provider_id: String(team.id), abbreviation: team.abbreviation, city: team.city, name: team.name, conference: team.conference ?? null, division: team.division ?? null, active: true }, { onConflict: "abbreviation" }).select("id").single();
    if (error) throw error; teamMap.set(team.id, data.id as string);
  }
  for (const week of weeks) {
    if (!week.seasons) continue;
    const response = await fetch(`https://api.balldontlie.io/nfl/v1/games?seasons[]=${week.seasons.nfl_season}&weeks[]=${week.nfl_week}&per_page=100`, { headers: { Authorization: providerKey } });
    if (!response.ok) throw new Error(`BALLDONTLIE ${response.status}`);
    const games = (await response.json() as { data: RemoteGame[] }).data;
    for (const game of games) {
      const home = teamMap.get(game.home_team.id), away = teamMap.get(game.visitor_team.id); if (!home || !away) continue;
      const { error } = await database.from("games").upsert({ provider: "balldontlie", provider_game_id: String(game.id), nfl_season: game.season, nfl_week: game.week, home_team_id: home, away_team_id: away, kickoff_at: game.date, status: normalizeStatus(game.status), home_score: game.home_team_score ?? null, away_score: game.visitor_team_score ?? null, period: game.period ? `Q${game.period}` : null, game_clock: game.time ?? null, provider_synced_at: new Date().toISOString() }, { onConflict: "provider,provider_game_id", ignoreDuplicates: false });
      if (error) throw error;
    }
  }
}

async function requesterCanImport(database: ReturnType<typeof createClient>, request: Request, payload: SyncRequest): Promise<boolean> {
  if (!payload.poolId || !Number.isInteger(payload.week)) return false;
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  const { data: { user }, error: userError } = await database.auth.getUser(token);
  if (userError || !user) return false;
  const { data: membership, error: membershipError } = await database.from("pool_members")
    .select("pool_id")
    .eq("pool_id", payload.poolId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("role", ["commissioner", "co_commissioner"])
    .maybeSingle();
  return !membershipError && Boolean(membership);
}

/**
 * Server-only scheduled sync. Provider data is normalized here before it can
 * reach the database; pool lines are intentionally never read or written.
 */
Deno.serve(async (request) => {
  const serviceKey = configuredSecretKey();
  if (!serviceKey) return Response.json({ error: "Service key unavailable" }, { status: 503 });
  const payload = await request.json().catch(() => ({})) as SyncRequest;
  const scheduledRequest = request.headers.get("apikey") === serviceKey;
  const providerKey = Deno.env.get("BALLDONTLIE_API_KEY");
  if (!providerKey) return Response.json({ error: "Provider not configured" }, { status: 503 });
  const database = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const commissionerRequest = !scheduledRequest && await requesterCanImport(database, request, payload);
  if (!scheduledRequest && !commissionerRequest) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: sync, error: syncError } = await database.from("provider_syncs").insert({ provider: "balldontlie" }).select("id").single();
  if (syncError) return Response.json({ error: "Unable to record sync" }, { status: 500 });
  try {
    await importOpenWeekSchedule(database, providerKey, commissionerRequest ? payload.poolId : undefined, commissionerRequest ? payload.week : undefined);
    const { data: games, error } = await database.from("games").select("id,provider_game_id,manual_override").in("status", ["scheduled", "in_progress"]);
    if (error) throw error;
    let affected = 0;
    for (const local of (games ?? []) as LocalGame[]) {
      if (local.manual_override) continue;
      const response = await fetch(`https://api.balldontlie.io/nfl/v1/games/${local.provider_game_id}`, { headers: { Authorization: providerKey } });
      if (!response.ok) throw new Error(`BALLDONTLIE ${response.status}`);
      const payload = await response.json() as { data: RemoteGame };
      const remote = payload.data;
      const state = normalizeStatus(remote.status);
      const { error: updateError } = await database.from("games").update({ kickoff_at: remote.date, status: state, home_score: remote.home_team_score ?? null, away_score: remote.visitor_team_score ?? null, period: remote.period ? `Q${remote.period}` : null, game_clock: remote.time ?? null, provider_synced_at: new Date().toISOString() }).eq("id", local.id);
      if (updateError) throw updateError;
      if (state === "final") { const { error: scoringError } = await database.rpc("score_final_game", { p_game_id: local.id }); if (scoringError) throw scoringError; }
      affected++;
    }
    await database.from("provider_syncs").update({ succeeded_at: new Date().toISOString(), affected_games: affected }).eq("id", sync.id);
    return Response.json({ ok: true, affected });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown sync error";
    await database.from("provider_syncs").update({ error_message: message }).eq("id", sync.id);
    return Response.json({ ok: false }, { status: 502 });
  }
});
