export type GameStatus = "scheduled" | "in_progress" | "final";
export type Role = "player" | "co_commissioner" | "commissioner";
export type Team = { id: string; abbreviation: string; displayName: string; shortName: string };
export type PoolGame = {
  id: string; week: number; away: Team; home: Team; kickoff: string; status: GameStatus;
  awayScore: number | null; homeScore: number | null; period?: string; clock?: string;
  underdogId: string; spread: number; manuallyOverridden?: boolean;
};
export type Pick = { id: string; playerId: string; playerName: string; gameId: string; teamId: string; spread: number; submittedAt: string; points: number | null };
