import { redirect } from "next/navigation";
import { isPickAvailable, isPickLocked, isPickRevealed } from "@/lib/domain/deadlines";
import type { Role } from "@/lib/domain/types";
import { serverClient } from "@/lib/supabase/server";

type MemberRow = { pool_id: string; role: Role; status: string; pick_blocked_at: string | null; pools: { name: string } | null };
type WeekRow = { id: string; nfl_week: number; status: "draft" | "open" | "complete" };
type LineRow = { game_id: string; underdog_team_id: string; favorite_team_id: string; underdog_spread: number | string; source: string | null; manual_override: boolean };
type GameRow = { id: string; kickoff_at: string; status: "scheduled" | "in_progress" | "final" | "postponed" | "cancelled"; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; period: string | null; game_clock: string | null; manual_override: boolean };
type TeamRow = { id: string; abbreviation: string; city: string; name: string };
type PickRow = { id: string; player_id: string; game_id: string; team_id: string; stored_spread: number | string; final_points: number | string | null; submitted_at: string };
type ProfileRow = { id: string; display_name: string };
type MemberNoteRow = { member_id: string; note: string };

export type ActivePool = { id: string; name: string; role: Role };
export type LiveGame = { id: string; kickoff: string; status: GameRow["status"]; away: TeamRow; home: TeamRow; underdog: TeamRow; favorite: TeamRow; spread: number; awayScore: number | null; homeScore: number | null; period: string | null; clock: string | null; locked: boolean; available: boolean; revealed: boolean; manuallyOverridden: boolean };
export type LivePick = { id: string; playerId: string; playerName: string; gameId: string; teamId: string; spread: number; finalPoints: number | null; submittedAt: string };
export type PoolMember = { userId: string; displayName: string; role: Role; status: string; pickBlocked: boolean };
export type ScheduledGame = { id: string; kickoff: string; away: TeamRow; home: TeamRow; hasLine: boolean; underdogTeamId: string | null; spread: number | null; lineSource: string | null; lineManuallyOverridden: boolean };
export type PoolContext = { userId: string; displayName: string; pool: ActivePool | null; pendingPool: boolean; pickBlocked: boolean; week: WeekRow | null; games: LiveGame[]; schedule: ScheduledGame[]; picks: LivePick[]; members: PoolMember[]; memberNotes: Record<string, string>; seasonTotals: Record<string, number>; lastSync: string | null };

export function supabaseConfigured(): boolean { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }

export async function requirePoolContext(): Promise<PoolContext> {
  if (!supabaseConfigured()) redirect("/login?error=unavailable");
  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { data: memberData } = await db.from("pool_members").select("pool_id,role,status,pick_blocked_at,pools(name)").eq("user_id", user.id);
  const memberships = (memberData ?? []) as unknown as MemberRow[];
  const active = memberships.find((member) => member.status === "active");
  if (!active) return { userId: user.id, displayName: (profile as { display_name?: string } | null)?.display_name ?? "Player", pool: null, pendingPool: memberships.some((member) => member.status === "pending"), pickBlocked: false, week: null, games: [], schedule: [], picks: [], members: [], memberNotes: {}, seasonTotals: {}, lastSync: null };
  const pool = { id: active.pool_id, name: active.pools?.name ?? "GameDay Pool", role: active.role };
  const { data: seasons } = await db.from("seasons").select("id,nfl_season").eq("pool_id", pool.id).eq("is_active", true).limit(1);
  const season = (seasons ?? []) as Array<{ id: string; nfl_season: number }>;
  const { data: weekData } = season[0] ? await db.from("weeks").select("id,nfl_week,status").eq("season_id", season[0].id).order("nfl_week", { ascending: false }).limit(1) : { data: [] };
  const week = ((weekData ?? [])[0] ?? null) as WeekRow | null;
  const { data: lineData } = await db.from("pool_game_lines").select("game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override").eq("pool_id", pool.id);
  const lines = (lineData ?? []) as unknown as LineRow[];
  const { data: gameData } = week && season[0] ? await db.from("games").select("id,kickoff_at,status,home_team_id,away_team_id,home_score,away_score,period,game_clock,manual_override").eq("nfl_season", season[0].nfl_season).eq("nfl_week", week.nfl_week) : { data: [] };
  const gameRows = (gameData ?? []) as unknown as GameRow[];
  const teamIds = [...new Set([...gameRows.map((game) => game.home_team_id), ...gameRows.map((game) => game.away_team_id)])];
  const { data: teamData } = teamIds.length ? await db.from("teams").select("id,abbreviation,city,name").in("id", teamIds) : { data: [] };
  const teams = new Map(((teamData ?? []) as unknown as TeamRow[]).map((team) => [team.id, team]));
  const now = new Date();
  const games = gameRows.flatMap((game) => {
    const line = lines.find((item) => item.game_id === game.id); const home = teams.get(game.home_team_id); const away = teams.get(game.away_team_id); const underdog = line && teams.get(line.underdog_team_id); const favorite = line && teams.get(line.favorite_team_id);
    return line && home && away && underdog && favorite ? [{ id: game.id, kickoff: game.kickoff_at, status: game.status, home, away, underdog, favorite, spread: Number(line.underdog_spread), homeScore: game.home_score, awayScore: game.away_score, period: game.period, clock: game.game_clock, locked: isPickLocked(new Date(game.kickoff_at), now), available: game.status === "scheduled" && isPickAvailable(new Date(game.kickoff_at), now), revealed: isPickRevealed(new Date(game.kickoff_at), now), manuallyOverridden: game.manual_override }] : [];
  }).sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  const schedule = gameRows.flatMap((game) => {
    const away = teams.get(game.away_team_id), home = teams.get(game.home_team_id), line = lines.find((item) => item.game_id === game.id);
    return away && home ? [{ id: game.id, kickoff: game.kickoff_at, away, home, hasLine: Boolean(line), underdogTeamId: line?.underdog_team_id ?? null, spread: line ? Number(line.underdog_spread) : null, lineSource: line?.source ?? null, lineManuallyOverridden: line?.manual_override ?? false }] : [];
  }).sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  const { data: pickData } = week ? await db.from("picks").select("id,player_id,game_id,team_id,stored_spread,final_points,submitted_at").eq("pool_id", pool.id).eq("week_id", week.id) : { data: [] };
  const rawPicks = (pickData ?? []) as unknown as PickRow[];
  const { data: rosterData } = await db.from("pool_members").select("user_id,role,status,pick_blocked_at").eq("pool_id", pool.id);
  const roster = (rosterData ?? []) as Array<{ user_id: string; role: Role; status: string; pick_blocked_at: string | null }>;
  const profileIds = [...new Set([...roster.map((member) => member.user_id), ...rawPicks.map((pick) => pick.player_id)])];
  const { data: profiles } = profileIds.length ? await db.from("profiles").select("id,display_name").in("id", profileIds) : { data: [] };
  const profileMap = new Map(((profiles ?? []) as unknown as ProfileRow[]).map((item) => [item.id, item.display_name]));
  const picks = rawPicks.map((pick) => ({ id: pick.id, playerId: pick.player_id, playerName: profileMap.get(pick.player_id) ?? "Pool member", gameId: pick.game_id, teamId: pick.team_id, spread: Number(pick.stored_spread), finalPoints: pick.final_points === null ? null : Number(pick.final_points), submittedAt: pick.submitted_at }));
  const members = roster.map((member) => ({ userId: member.user_id, displayName: profileMap.get(member.user_id) ?? "Pool member", role: member.role, status: member.status, pickBlocked: Boolean(member.pick_blocked_at) }));
  const { data: noteData } = active.role === "commissioner" ? await db.from("pool_member_notes").select("member_id,note").eq("pool_id", pool.id) : { data: [] };
  const memberNotes = Object.fromEntries(((noteData ?? []) as MemberNoteRow[]).map((item) => [item.member_id, item.note]));
  const completeWeekIds = season[0] ? ((await db.from("weeks").select("id").eq("season_id", season[0].id).eq("status", "complete")).data ?? []).map((item) => item.id as string) : [];
  const { data: seasonPickData } = completeWeekIds.length ? await db.from("picks").select("player_id,final_points").eq("pool_id", pool.id).in("week_id", completeWeekIds) : { data: [] };
  const seasonTotals = ((seasonPickData ?? []) as Array<{ player_id: string; final_points: number | string | null }>).reduce<Record<string, number>>((totals, pick) => {
    totals[pick.player_id] = (totals[pick.player_id] ?? 0) + (pick.final_points === null ? 0 : Number(pick.final_points));
    return totals;
  }, {});
  const { data: syncData } = await db.from("provider_syncs").select("succeeded_at").eq("provider", "balldontlie").not("succeeded_at", "is", null).order("succeeded_at", { ascending: false }).limit(1);
  return { userId: user.id, displayName: (profile as { display_name?: string } | null)?.display_name ?? "Player", pool, pendingPool: false, pickBlocked: Boolean(active.pick_blocked_at), week, games, schedule, picks, members, memberNotes, seasonTotals, lastSync: ((syncData ?? [])[0] as { succeeded_at: string } | undefined)?.succeeded_at ?? null };
}
