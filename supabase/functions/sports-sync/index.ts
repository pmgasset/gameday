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
  season_type: PoolSeasonType;
  seasons: { nfl_season: number; pool_id: string } | null;
};
type PoolSeasonType = "preseason" | "regular" | "postseason";
type OpenPoolWeek = { poolId: string; season: number; week: number; seasonType: PoolSeasonType };
type RemoteOdds = {
  game_id: string;
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
  season_type: PoolSeasonType;
  kickoff_at: string;
  home_team_id: string;
  away_team_id: string;
};
type OddsGame = StoredGame & {
  homeTeam: { abbreviation: string; city: string; name: string };
  awayTeam: { abbreviation: string; city: string; name: string };
};
type RundownEvent = {
  teams: Array<{ name: string; mascot?: string; abbreviation?: string; is_away?: boolean; is_home?: boolean }>;
  markets?: Array<{
    market_id: number;
    period_id: number;
    participants: Array<{
      name: string;
      lines: Array<{ value: string | number | null; prices: Record<string, { updated_at?: string }> }>;
    }>;
  }>;
};
type LocalGame = {
  id: string;
  provider_game_id: string;
  nfl_season: number;
  nfl_week: number;
  season_type: PoolSeasonType;
  kickoff_at: string;
  status: "scheduled" | "in_progress";
  manual_override: boolean;
};
type SyncMode = "schedule" | "live" | "snapshot";
type SyncRequest = {
  poolId?: string;
  week?: number;
  seasonType?: PoolSeasonType;
  source?: string;
  mode?: SyncMode;
};
type WeekKey = { season: number; week: number; seasonType: PoolSeasonType };
type TeamId = { id: string; provider_id: string | null };
type SyncOutcome = { affected: number; warning?: string; gamesUpdated?: number; oddsLines?: number };

const PROVIDER = "balldontlie";
const PROVIDER_BASE_URL = "https://api.balldontlie.io/nfl/v1";
const ODDS_PROVIDER = "therundown";
const RUNDOWN_BASE_URL = "https://therundown.io/api/v2";
const RUNDOWN_AFFILIATES: Record<string, string> = {
  draftkings: "19",
  fanduel: "23",
  betmgm: "22",
  thescorebet: "24",
  pinnacle: "3",
  bovada: "2",
};
const RUNDOWN_REQUEST_INTERVAL_MS = 1_100;
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
  return [...new Map(weeks.map((week) => [`${week.season}:${week.seasonType}:${week.week}`, week])).values()];
}

function balldontlieSeasonType(seasonType: PoolSeasonType): number {
  return seasonType === "preseason" ? 1 : seasonType === "postseason" ? 3 : 2;
}

function rundownSportId(seasonType: PoolSeasonType): number {
  // TheRundown publishes NFL preseason in its dedicated sport feed. Regular
  // and playoff games are both available from its normal NFL feed.
  return seasonType === "preseason" ? 25 : 2;
}

async function providerRequest<T>(providerKey: string, path: string): Promise<T> {
  const response = await fetch(`${PROVIDER_BASE_URL}${path}`, {
    headers: { Authorization: providerKey },
  });
  if (!response.ok) throw new Error(`BALLDONTLIE ${response.status}`);
  return response.json() as Promise<T>;
}

async function rundownRequest<T>(oddsKey: string, path: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${RUNDOWN_BASE_URL}${path}`, {
      headers: { "X-TheRundown-Key": oddsKey },
    });
    if (response.ok) return response.json() as Promise<T>;
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, RUNDOWN_REQUEST_INTERVAL_MS * (attempt + 1)));
      continue;
    }
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`TheRundown ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  throw new Error("TheRundown rate limit retry exhausted");
}

async function getWeekGames(providerKey: string, season: number, week: number, seasonType: PoolSeasonType): Promise<RemoteGame[]> {
  const result = await providerRequest<{ data: RemoteGame[] }>(
    providerKey,
    `/games?seasons[]=${season}&weeks[]=${week}&season_type[]=${balldontlieSeasonType(seasonType)}&per_page=100`,
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

function easternDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesRundownTeam(team: OddsGame["homeTeam"], remote: RundownEvent["teams"][number]): boolean {
  const localName = normalized(`${team.city} ${team.name}`);
  const localCity = normalized(team.city);
  const remoteName = normalized(remote.name);
  return normalized(team.abbreviation) === normalized(remote.abbreviation ?? "")
    || localName === remoteName
    || remoteName === localCity
    || remoteName.endsWith(localCity)
    || remoteName.endsWith(normalized(team.name));
}

function rundownOddsForGame(game: OddsGame, event: RundownEvent): RemoteOdds[] {
  const away = event.teams.find((team) => team.is_away || matchesRundownTeam(game.awayTeam, team));
  const home = event.teams.find((team) => team.is_home || matchesRundownTeam(game.homeTeam, team));
  if (!away || !home || !matchesRundownTeam(game.awayTeam, away) || !matchesRundownTeam(game.homeTeam, home)) return [];
  const spread = event.markets?.find((market) => market.market_id === 2 && market.period_id === 0);
  if (!spread) return [];
  const linesForTeam = (remote: RundownEvent["teams"][number], local: OddsGame["homeTeam"]) => spread.participants.find((participant) => {
    const participantName = normalized(participant.name);
    return participantName === normalized(remote.name) || participantName.endsWith(normalized(local.name));
  })?.lines ?? [];
  const awayLines = linesForTeam(away, game.awayTeam);
  const homeLines = linesForTeam(home, game.homeTeam);

  return Object.entries(RUNDOWN_AFFILIATES).flatMap(([vendor, affiliateId]) => {
    const awayLine = awayLines.find((line) => line.prices?.[affiliateId]);
    const homeLine = homeLines.find((line) => line.prices?.[affiliateId]);
    if (!awayLine || !homeLine) return [];
    const updatedAt = [awayLine.prices[affiliateId]?.updated_at, homeLine.prices[affiliateId]?.updated_at]
      .filter((value): value is string => Boolean(value))
      .sort();
    return [{
      game_id: game.provider_game_id,
      vendor,
      spread_home_value: homeLine.value,
      spread_away_value: awayLine.value,
      updated_at: updatedAt[updatedAt.length - 1],
    }];
  });
}

async function getGameOdds(oddsKey: string, games: OddsGame[]): Promise<RemoteOdds[]> {
  if (!games.length) return [];
  const dates = [...new Map(games.map((game) => [`${game.season_type}:${easternDate(game.kickoff_at)}`, { seasonType: game.season_type, date: easternDate(game.kickoff_at) }])).values()];
  const affiliateIds = Object.values(RUNDOWN_AFFILIATES).join(",");
  const events: RundownEvent[] = [];
  for (const [index, date] of dates.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, RUNDOWN_REQUEST_INTERVAL_MS));
    const response = await rundownRequest<{ events?: RundownEvent[] }>(
      oddsKey,
      `/sports/${rundownSportId(date.seasonType)}/events/${date.date}?market_ids=2&affiliate_ids=${affiliateIds}&main_line=true&hide_closed=true&offset=240`,
    );
    events.push(...(response.events ?? []));
  }
  return games.flatMap((game) => {
    const event = events.find((candidate) => rundownOddsForGame(game, candidate).length > 0);
    return event ? rundownOddsForGame(game, event) : [];
  });
}

async function getOpenPoolWeeks(
  database: ReturnType<typeof createClient>,
  poolId?: string,
  requestedWeek?: number,
  requestedSeasonType?: PoolSeasonType,
): Promise<OpenPoolWeek[]> {
  let query = database
    .from("weeks")
    .select("nfl_week,season_type,seasons!inner(nfl_season,is_active,pool_id)")
    .eq("seasons.is_active", true)
    .eq("status", "open");
  if (poolId) query = query.eq("seasons.pool_id", poolId);
  if (requestedWeek) query = query.eq("nfl_week", requestedWeek);
  if (requestedSeasonType) query = query.eq("season_type", requestedSeasonType);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as OpenWeek[]).flatMap((week) =>
    week.seasons ? [{ poolId: week.seasons.pool_id, season: week.seasons.nfl_season, week: week.nfl_week, seasonType: week.season_type }] : [],
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

function selectedOdds(odds: RemoteOdds[], allowedVendors?: string[]): RemoteOdds[] {
  const vendorRank = (vendor: string) => {
    const normalized = vendor.toLowerCase();
    if (normalized === "draftkings") return 0;
    if (normalized === "fanduel") return 1;
    if (normalized === "betmgm") return 2;
    if (normalized === "thescorebet") return 3;
    if (normalized === "pinnacle") return 4;
    if (normalized === "bovada") return 5;
    return 6;
  };
  const selected = new Map<string, RemoteOdds>();
  for (const line of odds) {
    if (allowedVendors && !allowedVendors.includes(line.vendor.toLowerCase())) continue;
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
  oddsKey: string | undefined,
  poolWeeks: OpenPoolWeek[],
): Promise<SyncOutcome> {
  const games = await storedGamesForPoolWeeks(database, poolWeeks);
  if (!games.length) return { affected: 0 };
  if (!oddsKey) return { affected: 0, warning: "TheRundown odds prefill skipped: THERUNDOWN_API_KEY is not configured." };
  let odds: RemoteOdds[];
  try {
    odds = await getGameOdds(oddsKey, games);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown odds error";
    // The schedule remains useful when odds coverage is unavailable, but the
    // audit row makes an access failure visible to commissioners.
    return { affected: 0, warning: `TheRundown odds prefill failed: ${message}` };
  }
  const gamesByProviderId = new Map(games.map((game) => [game.provider_game_id, game]));
  const usableGameIds = new Set<string>();
  let affected = 0;
  for (const oddsLine of selectedOdds(odds)) {
    const game = gamesByProviderId.get(String(oddsLine.game_id));
    if (!game) continue;
    const line = underdogForOdds(game, oddsLine);
    if (!line) continue;
    usableGameIds.add(game.provider_game_id);
    const matchingPools = poolWeeks.filter((poolWeek) => poolWeek.season === game.nfl_season && poolWeek.week === game.nfl_week && poolWeek.seasonType === game.season_type);
    for (const poolWeek of matchingPools) {
      const { error: lineError } = await database.rpc("prefill_odds_line", {
        p_pool_id: poolWeek.poolId,
        p_game_id: game.id,
        p_underdog_team_id: line.teamId,
        p_spread: line.spread,
        p_source: `${ODDS_PROVIDER}:${oddsLine.vendor}`,
      });
      if (lineError) throw lineError;
      affected++;
    }
  }
  const missing = games.length - usableGameIds.size;
  return {
    affected,
    oddsLines: affected,
    warning: missing ? `TheRundown returned no usable underdog spread for ${missing} imported game${missing === 1 ? "" : "s"}.` : undefined,
  };
}

async function storedGamesForPoolWeeks(
  database: ReturnType<typeof createClient>,
  poolWeeks: OpenPoolWeek[],
): Promise<OddsGame[]> {
  const weeks = uniqueWeeks(poolWeeks.map(({ season, week, seasonType }) => ({ season, week, seasonType })));
  if (!weeks.length) return [];
  const { data, error } = await database
    .from("games")
    .select("id,provider_game_id,nfl_season,nfl_week,season_type,kickoff_at,home_team_id,away_team_id")
    .eq("provider", PROVIDER)
    .in("nfl_season", [...new Set(weeks.map((week) => week.season))])
    .in("nfl_week", [...new Set(weeks.map((week) => week.week))])
    .in("season_type", [...new Set(weeks.map((week) => week.seasonType))]);
  if (error) throw error;
  const requested = new Set(weeks.map((week) => `${week.season}:${week.seasonType}:${week.week}`));
  const games = ((data ?? []) as StoredGame[]).filter((game) => requested.has(`${game.nfl_season}:${game.season_type}:${game.nfl_week}`));
  const teamIds = [...new Set(games.flatMap((game) => [game.home_team_id, game.away_team_id]))];
  const { data: teams, error: teamsError } = await database
    .from("teams")
    .select("id,abbreviation,city,name")
    .in("id", teamIds);
  if (teamsError) throw teamsError;
  const teamMap = new Map(((teams ?? []) as Array<{ id: string; abbreviation: string; city: string; name: string }>).map((team) => [team.id, team]));
  return games.flatMap((game) => {
    const homeTeam = teamMap.get(game.home_team_id);
    const awayTeam = teamMap.get(game.away_team_id);
    return homeTeam && awayTeam ? [{ ...game, homeTeam, awayTeam }] : [];
  });
}

async function snapshotTuesdayOdds(
  database: ReturnType<typeof createClient>,
  oddsKey: string | undefined,
): Promise<SyncOutcome> {
  const poolWeeks = await getOpenPoolWeeks(database);
  const games = await storedGamesForPoolWeeks(database, poolWeeks);
  if (!games.length) return { affected: 0, warning: "Tuesday odds snapshot skipped: no imported games in an open pool week." };

  if (!oddsKey) throw new Error("THERUNDOWN_API_KEY is not configured");
  const odds = await getGameOdds(oddsKey, games);
  const gamesByProviderId = new Map(games.map((game) => [game.provider_game_id, game]));
  const draftKingsOdds = selectedOdds(odds, ["draftkings"]);
  const usableGameIds = new Set<string>();
  let affected = 0;

  for (const oddsLine of draftKingsOdds) {
    const game = gamesByProviderId.get(String(oddsLine.game_id));
    if (!game) continue;
    const line = underdogForOdds(game, oddsLine);
    if (!line) continue;
    usableGameIds.add(game.provider_game_id);
    const matchingPools = poolWeeks.filter((poolWeek) => poolWeek.season === game.nfl_season && poolWeek.week === game.nfl_week && poolWeek.seasonType === game.season_type);
    for (const poolWeek of matchingPools) {
      const { data: locked, error } = await database.rpc("snapshot_provider_odds_line", {
        p_pool_id: poolWeek.poolId,
        p_game_id: game.id,
        p_underdog_team_id: line.teamId,
        p_spread: line.spread,
        p_source: "therundown:draftkings",
        p_provider_odds_updated_at: oddsLine.updated_at ?? null,
      });
      if (error) throw error;
      if (locked) affected++;
    }
  }

  const missing = games.length - usableGameIds.size;
  return {
    affected,
    oddsLines: affected,
    warning: missing ? `Tuesday odds snapshot missing usable TheRundown DraftKings spreads for ${missing} imported game${missing === 1 ? "" : "s"}.` : undefined,
  };
}

async function saveSchedule(
  database: ReturnType<typeof createClient>,
  providerKey: string,
  oddsKey: string | undefined,
  poolId?: string,
  requestedWeek?: number,
  requestedSeasonType?: PoolSeasonType,
): Promise<SyncOutcome> {
  const poolWeeks = await getOpenPoolWeeks(database, poolId, requestedWeek, requestedSeasonType);
  const weeks = uniqueWeeks(poolWeeks.map(({ season, week, seasonType }) => ({ season, week, seasonType })));
  if (!weeks.length) return { affected: 0 };

  const gamesByWeek = await Promise.all(
    weeks.map(async (week) => getWeekGames(providerKey, week.season, week.week, week.seasonType)),
  );
  const games = gamesByWeek.flatMap((weekGames, index) => weekGames.map((game) => ({
    ...game,
    seasonType: weeks[index].seasonType,
  })));
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
        season_type: game.seasonType,
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
  const odds = await prefillOdds(database, oddsKey, poolWeeks);
  const { data: finalized, error: finalizeError } = await database.rpc("finalize_ready_pool_weeks");
  if (finalizeError) throw finalizeError;
  return {
    affected: affected + odds.affected + Number(finalized ?? 0),
    gamesUpdated: affected,
    oddsLines: odds.oddsLines ?? 0,
    warning: odds.warning,
  };
}

function isInLiveWindow(game: LocalGame, now: number): boolean {
  if (game.status === "in_progress") return true;
  const kickoff = new Date(game.kickoff_at).getTime();
  return kickoff >= now - LIVE_LOOKBACK_MS && kickoff <= now + LIVE_LOOKAHEAD_MS;
}

async function syncLiveGames(
  database: ReturnType<typeof createClient>,
  providerKey: string,
): Promise<SyncOutcome> {
  const { data, error } = await database
    .from("games")
    .select("id,provider_game_id,nfl_season,nfl_week,season_type,kickoff_at,status,manual_override")
    .eq("provider", PROVIDER)
    .eq("manual_override", false)
    .in("status", ["scheduled", "in_progress"]);
  if (error) throw error;
  const candidates = ((data ?? []) as LocalGame[]).filter((game) => isInLiveWindow(game, Date.now()));
  if (!candidates.length) return { affected: 0 };

  const candidateIds = new Set(candidates.map((game) => game.provider_game_id));
  const localGames = new Map(candidates.map((game) => [game.provider_game_id, game]));
  const weeks = uniqueWeeks(candidates.map((game) => ({ season: game.nfl_season, week: game.nfl_week, seasonType: game.season_type })));
  const gameLists = await Promise.all(weeks.map((week) => getWeekGames(providerKey, week.season, week.week, week.seasonType)));
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
  return { affected: affected + Number(finalized ?? 0), gamesUpdated: affected };
}

function isTuesdaySnapshotTime(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return value("weekday") === "Tue" && value("hour") === "09";
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
 * The scheduler uses a three-hourly bulk schedule import, a five-minute
 * live-score poll, and a Tuesday 9 AM Eastern DraftKings snapshot.
 */
Deno.serve(async (request) => {
  const serviceKey = configuredSecretKey();
  if (!serviceKey) return Response.json({ error: "Service key unavailable" }, { status: 503 });
  const payload = await request.json().catch(() => ({})) as SyncRequest;
  const scheduledRequest = request.headers.get("apikey") === serviceKey;
  const providerKey = Deno.env.get("BALLDONTLIE_API_KEY");
  const oddsKey = Deno.env.get("THERUNDOWN_API_KEY");
  if (!providerKey) return Response.json({ error: "Provider not configured" }, { status: 503 });
  const database = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const commissionerRequest = !scheduledRequest && await requesterCanImport(database, request, payload);
  if (!scheduledRequest && !commissionerRequest) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const requestedMode = payload.mode;
  const mode: SyncMode = commissionerRequest || requestedMode === "schedule"
    ? "schedule"
    : requestedMode === "snapshot"
      ? "snapshot"
      : "live";
  if (mode === "snapshot" && !isTuesdaySnapshotTime()) {
    return Response.json({ ok: true, mode, skipped: true, reason: "Tuesday snapshot runs at 9:00 AM America/New_York." });
  }
  const { data: sync, error: syncError } = await database
    .from("provider_syncs")
    .insert({ provider: PROVIDER, sync_mode: mode })
    .select("id")
    .single();
  if (syncError) return Response.json({ error: "Unable to record sync" }, { status: 500 });

  try {
    const outcome = mode === "schedule"
      ? await saveSchedule(database, providerKey, oddsKey, commissionerRequest ? payload.poolId : undefined, commissionerRequest ? payload.week : undefined, commissionerRequest ? payload.seasonType : undefined)
      : mode === "snapshot"
        ? await snapshotTuesdayOdds(database, oddsKey)
        : await syncLiveGames(database, providerKey);
    await database
      .from("provider_syncs")
      .update({ succeeded_at: new Date().toISOString(), affected_games: outcome.affected, warning_message: outcome.warning ?? null })
      .eq("id", sync.id);
    return Response.json({ ok: true, mode, ...outcome });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown sync error";
    await database.from("provider_syncs").update({ error_message: message }).eq("id", sync.id);
    return Response.json({ ok: false, mode }, { status: 502 });
  }
});
