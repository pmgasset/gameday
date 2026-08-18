import { createClient } from "npm:@supabase/supabase-js@2";

type RemoteGame = {
  id: number; date: string; status: string; period?: number; time?: string;
  home_team_score?: number; visitor_team_score?: number;
};
type LocalGame = { id: string; provider_game_id: string; manual_override: boolean };

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

/**
 * Server-only scheduled sync. Provider data is normalized here before it can
 * reach the database; pool lines are intentionally never read or written.
 */
Deno.serve(async (request) => {
  const serviceKey = configuredSecretKey();
  if (!serviceKey || request.headers.get("apikey") !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const providerKey = Deno.env.get("BALLDONTLIE_API_KEY");
  if (!providerKey) return Response.json({ error: "Provider not configured" }, { status: 503 });
  const database = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sync, error: syncError } = await database.from("provider_syncs").insert({ provider: "balldontlie" }).select("id").single();
  if (syncError) return Response.json({ error: "Unable to record sync" }, { status: 500 });
  try {
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
