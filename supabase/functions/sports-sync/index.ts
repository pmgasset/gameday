import { createClient } from "npm:@supabase/supabase-js@2";

type RemoteGame = {
  id: number;
  date: string;
  status: string;
  period?: number;
  time?: string;
  home_team_score?: number;
  visitor_team_score?: number;
  season: number;
  week: number;
  home_team: { id: number };
  visitor_team: { id: number };
};
type RemoteTeam = {
  id: number;
  abbreviation: string;
  location: string;
  name: string;
  conference?: string;
  division?: string;
};
type OpenWeek = {
  nfl_week: number;
  seasons: { nfl_season: number; pool_id: string } | null;
};
type OpenPoolWeek = { poolId: string; season: number; week: number };
type RemoteOdds = {
  game_id: number;
  vendor: string;
  spread_home_value: string | number | null;
  spread_away_value: string | number | null;
  updated_at?: string;
};
type StoredGame = {
  id: string;
  provider_game_id: string;
  nfl_season: number;
  nfl_week: number;
  home_team_id: string;
  away_team_id: string;
};
type LocalGame = {
  id: string;
  provider_game_id: string;
  nfl_season: number;
  nfl_week: number;
  kickoff_at: string;
  status: "scheduled" | "in_progress";
  manual_override: boolean;
};
type SyncMode = "schedule" | "live";
type SyncRequest = {
  poolId?: string;
  week?: number;
  source?: string;
  mode?: SyncMode;
};
type WeekKey = { season: number; week: number };
type TeamId = { id: string; provider_id: string | null };

const PROVIDER = "balldontlie";
const PROVIDER_BASE_URL = "https://api.balldontlie.io/nfl/v1";
const LIVE_LOOKAHEAD_MS = 15 * 60 * 1000;
const LIVE_LOOKBACK_MS = 12 * 60 * 60 * 1000;

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

function uniqueWeeks(weeks: WeekKey[]): WeekKey[] {
  return [...new Map(weeks.map((week) => [`${week.season}:${week.week}`, week])).values()];
}

async function providerRequest<T>(providerKey: string, path: string): Promise<T> {
  const response = await fetch(`${PROVIDER_BASE_URL}${path}`, {
    headers: { Authorization: providerKey },
  });
  if (!response.ok) throw new Error(`BALLDONTLIE ${response.status}`);
  return response.json() as Promise<T>;
}

async function getWeekGames(providerKey: string, season: number, week: number): Promise<RemoteGame[]> {
  const result = await providerRequest<{ data: RemoteGame[] }>(
    providerKey,
    `/games?seasons[]=${season}&weeks[]=${week}&per_page=100`,
  );
  const games = result.data ?? [];
  const mismatch = games.find((game) => game.season !== season || game.week !== week);
  if (mismatch) {
    throw new Error(
      `BALLDONTLIE returned game ${mismatch.id} for season ${mismatch.season}, week ${mismatch.week}; expected season ${season}, week ${week}`,
    );
  }
  return games;
}

async function getWeekOdds(providerKey: string, season: number, week: number): Promise<RemoteOdds[]> {
  const result = await providerRequest<{ data: RemoteOdds[] }>(
    providerKey,
    `/odds?season=${season}&week=${week}&per_page=100`,
  );
  return result.data;
}

async function getOpenPoolWeeks(
  database: ReturnType<typeof createClient>,
  poolId?: string,
  requestedWeek?: number,
): Promise<OpenPoolWeek[]> {
  let query = database
    .from("weeks")
    .select("nfl_week,seasons!inner(nfl_season,is_active,pool_id)")
    .eq("seasons.is_active", true)
    .eq("status", "open");
  if (poolId) query = query.eq("seasons.pool_id", poolId);
  if (requestedWeek) query = query.eq("nfl_week", requestedWeek);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as OpenWeek[]).flatMap((week) =>
    week.seasons ? [{ poolId: week.seasons.pool_id, season: week.seasons.nfl_season, week: week.nfl_week }] : [],
  );
}

async function ensureTeams(
  database: ReturnType<typeof createClient>,
  providerKey: string,
  games: RemoteGame[],
): Promise<Map<number, string>> {
  const { data: storedTeams, error: storedTeamsError } = await database
    .from("teams")
    .select("id,provider_id")
    .eq("provider", PROVIDER);
  if (storedTeamsError) throw storedTeamsError;

  const teamMap = new Map<number, string>();
  for (const team of (storedTeams ?? []) as TeamId[]) {
    if (team.provider_id) teamMap.set(Number(team.provider_id), team.id);
  }

  const neededIds = new Set(games.flatMap((game) => [game.home_team.id, game.visitor_team.id]));
  const missingIds = [...neededIds].filter((id) => !teamMap.has(id));
  if (!missingIds.length) return teamMap;

  const { data: remoteTeams } = await providerRequest<{ data: RemoteTeam[] }>(providerKey, "/teams?per_page=100");
  for (const team of remoteTeams.filter((team) => missingIds.includes(team.id))) {
    const { data, error } = await database
      .from("teams")
      .upsert(
        {
          provider: PROVIDER,
          provider_id: String(team.id),
          abbreviation: team.abbreviation,
          city: team.location,
          name: team.name,
          conference: team.conference ?? null,
          division: team.division ?? null,
          active: true,
        },
        { onConflict: "abbreviation" },
      )
      .select("id")
      .single();
    if (error) throw error;
    teamMap.set(team.id, data.id as string);
  }
  return teamMap;
}

function preferredOdds(odds: RemoteOdds[]): RemoteOdds[] {
  const vendorRank = (vendor: string) => {
    const normalized = vendor.toLowerCase();
    if (normalized === "draftkings") return 0;
    if (normalized === "fanduel") return 1;
    if (normalized === "betmgm") return 2;
    return 3;
  };
  const selected = new Map<number, RemoteOdds>();
  for (const line of odds) {
    const current = selected.get(line.game_id);
    if (!current || vendorRank(line.vendor) < vendorRank(current.vendor) || (
      vendorRank(line.vendor) === vendorRank(current.vendor)
      && (line.updated_at ?? "") > (current.updated_at ?? "")
    )) selected.set(line.game_id, line);
  }
  return [...selected.values()];
}

function underdogForOdds(game: StoredGame, odds: RemoteOdds): { teamId: string; spread: number } | null {
  const home = Number(odds.spread_home_value);
  const away = Number(odds.spread_away_value);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (home > 0 && away < 0) return { teamId: game.home_team_id, spread: home };
  if (away > 0 && home < 0) return { teamId: game.away_team_id, spread: away };
  return null; // Pick'em, malformed, or a market without an underdog.
}

async function prefillOdds(
  database: ReturnType<typeof createClient>,
  providerKey: string,
  poolWeeks: OpenPoolWeek[],
): Promise<number> {
  const weeks = uniqueWeeks(poolWeeks.map(({ season, week }) => ({ season, week })));
  if (!weeks.length) return 0;
  let oddsByWeek: RemoteOdds[][];
  try {
    oddsByWeek = await Promise.all(weeks.map((week) => getWeekOdds(providerKey, week.season, week.week)));
  } catch {
    // Odds access depends on the BALLDONTLIE account tier and starts only at
    // its documented coverage point. Schedule import must remain usable.
    return 0;
  }
  const providerGameIds = [...new Set(oddsByWeek.flat().map((line) => String(line.game_id)))];
  if (!providerGameIds.length) return 0;
  const { data, error } = await database
    .from("games")
    .select("id,provider_game_id,nfl_season,nfl_week,home_team_id,away_team_id")
    .eq("provider", PROVIDER)
    .in("provider_game_id", providerGameIds);
  if (error) throw error;
  const games = new Map(((data ?? []) as StoredGame[]).map((game) => [game.provider_game_id, game]));
  let affected = 0;
  for (const odds of preferredOdds(oddsByWeek.flat())) {
    const game = games.get(String(odds.game_id));
    if (!game) continue;
    const line = underdogForOdds(game, odds);
    if (!line) continue;
    const matchingPools = poolWeeks.filter((poolWeek) => poolWeek.season === game.nfl_season && poolWeek.week === game.nfl_week);
    for (const poolWeek of matchingPools) {
      const { error: lineError } = await database.rpc("prefill_odds_line", {
        p_pool_id: poolWeek.poolId,
        p_game_id: game.id,
        p_underdog_team_id: line.teamId,
        p_spread: line.spread,
        p_source: `balldontlie:${odds.vendor}`,
      });
      if (lineError) throw lineError;
      affected++;
    }
  }
  return affected;
}

async function saveSchedule(
  database: ReturnType<typeof createClient>,
  providerKey: string,
  poolId?: string,
  requestedWeek?: number,
): Promise<number> {
  const poolWeeks = await getOpenPoolWeeks(database, poolId, requestedWeek);
  const weeks = uniqueWeeks(poolWeeks.map(({ season, week }) => ({ season, week })));
  if (!weeks.length) return 0;

  const gamesByWeek = await Promise.all(
    weeks.map(async (week) => getWeekGames(providerKey, week.season, week.week)),
  );
  const games = gamesByWeek.flat();
  const teamMap = await ensureTeams(database, providerKey, games);
  let affected = 0;

  for (const game of games) {
    const home = teamMap.get(game.home_team.id);
    const away = teamMap.get(game.visitor_team.id);
    if (!home || !away) continue;
    const { data: existing, error: existingError } = await database
      .from("games")
      .select("manual_override")
      .eq("provider", PROVIDER)
      .eq("provider_game_id", String(game.id))
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.manual_override) continue;

    const status = normalizeStatus(game.status);
    const { data: savedGame, error } = await database.from("games").upsert(
      {
        provider: PROVIDER,
        provider_game_id: String(game.id),
        nfl_season: game.season,
        nfl_week: game.week,
        home_team_id: home,
        away_team_id: away,
        kickoff_at: game.date,
        status,
        home_score: game.home_team_score ?? null,
        away_score: game.visitor_team_score ?? null,
        period: game.period ? `Q${game.period}` : null,
        game_clock: game.time ?? null,
        provider_synced_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_game_id", ignoreDuplicates: false },
    ).select("id").single();
    if (error) throw error;
    if (status === "final") {
      const { error: scoringError } = await database.rpc("score_final_game", { p_game_id: savedGame.id as string });
      if (scoringError) throw scoringError;
    }
    affected++;
  }
  const oddsAffected = await prefillOdds(database, providerKey, poolWeeks);
  const { data: finalized, error: finalizeError } = await database.rpc("finalize_ready_pool_weeks");
  if (finalizeError) throw finalizeError;
  return affected + oddsAffected + Number(finalized ?? 0);
}

function isInLiveWindow(game: LocalGame, now: number): boolean {
  if (game.status === "in_progress") return true;
  const kickoff = new Date(game.kickoff_at).getTime();
  return kickoff >= now - LIVE_LOOKBACK_MS && kickoff <= now + LIVE_LOOKAHEAD_MS;
}

async function syncLiveGames(
  database: ReturnType<typeof createClient>,
  providerKey: string,
): Promise<number> {
  const { data, error } = await database
    .from("games")
    .select("id,provider_game_id,nfl_season,nfl_week,kickoff_at,status,manual_override")
    .eq("provider", PROVIDER)
    .eq("manual_override", false)
    .in("status", ["scheduled", "in_progress"]);
  if (error) throw error;
  const candidates = ((data ?? []) as LocalGame[]).filter((game) => isInLiveWindow(game, Date.now()));
  if (!candidates.length) return 0;

  const candidateIds = new Set(candidates.map((game) => game.provider_game_id));
  const localGames = new Map(candidates.map((game) => [game.provider_game_id, game]));
  const weeks = uniqueWeeks(candidates.map((game) => ({ season: game.nfl_season, week: game.nfl_week })));
  const gameLists = await Promise.all(weeks.map((week) => getWeekGames(providerKey, week.season, week.week)));
  let affected = 0;

  for (const remote of gameLists.flat()) {
    const providerGameId = String(remote.id);
    if (!candidateIds.has(providerGameId)) continue;
    const local = localGames.get(providerGameId);
    if (!local) continue;
    const status = normalizeStatus(remote.status);
    const { error: updateError } = await database
      .from("games")
      .update({
        kickoff_at: remote.date,
        status,
        home_score: remote.home_team_score ?? null,
        away_score: remote.visitor_team_score ?? null,
        period: remote.period ? `Q${remote.period}` : null,
        game_clock: remote.time ?? null,
        provider_synced_at: new Date().toISOString(),
      })
      .eq("id", local.id)
      .eq("manual_override", false);
    if (updateError) throw updateError;
    if (status === "final") {
      const { error: scoringError } = await database.rpc("score_final_game", { p_game_id: local.id });
      if (scoringError) throw scoringError;
    }
    affected++;
  }
  const { data: finalized, error: finalizeError } = await database.rpc("finalize_ready_pool_weeks");
  if (finalizeError) throw finalizeError;
  return affected + Number(finalized ?? 0);
}

async function requesterCanImport(
  database: ReturnType<typeof createClient>,
  request: Request,
  payload: SyncRequest,
): Promise<boolean> {
  if (!payload.poolId || !Number.isInteger(payload.week)) return false;
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  const { data: { user }, error: userError } = await database.auth.getUser(token);
  if (userError || !user) return false;
  const { data: membership, error: membershipError } = await database
    .from("pool_members")
    .select("pool_id")
    .eq("pool_id", payload.poolId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("role", ["commissioner", "co_commissioner"])
    .maybeSingle();
  return !membershipError && Boolean(membership);
}

/**
 * The scheduler uses two modes: a three-hourly bulk schedule import and a
 * five-minute live-score poll that only runs around kickoff or while live.
 */
Deno.serve(async (request) => {
  const serviceKey = configuredSecretKey();
  if (!serviceKey) return Response.json({ error: "Service key unavailable" }, { status: 503 });
  const payload = await request.json().catch(() => ({})) as SyncRequest;
  const scheduledRequest = request.headers.get("apikey") === serviceKey;
  const providerKey = Deno.env.get("BALLDONTLIE_API_KEY");
  if (!providerKey) return Response.json({ error: "Provider not configured" }, { status: 503 });
  const database = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const commissionerRequest = !scheduledRequest && await requesterCanImport(database, request, payload);
  if (!scheduledRequest && !commissionerRequest) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const mode: SyncMode = commissionerRequest || payload.mode === "schedule" ? "schedule" : "live";
  const { data: sync, error: syncError } = await database
    .from("provider_syncs")
    .insert({ provider: PROVIDER })
    .select("id")
    .single();
  if (syncError) return Response.json({ error: "Unable to record sync" }, { status: 500 });

  try {
    const affected = mode === "schedule"
      ? await saveSchedule(database, providerKey, commissionerRequest ? payload.poolId : undefined, commissionerRequest ? payload.week : undefined)
      : await syncLiveGames(database, providerKey);
    await database
      .from("provider_syncs")
      .update({ succeeded_at: new Date().toISOString(), affected_games: affected })
      .eq("id", sync.id);
    return Response.json({ ok: true, mode, affected });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown sync error";
    await database.from("provider_syncs").update({ error_message: message }).eq("id", sync.id);
    return Response.json({ ok: false, mode }, { status: 502 });
  }
});
