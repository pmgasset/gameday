import type { Pick, PoolGame } from "./types";

export function officialPickPoints(pick: Pick, game: PoolGame): number {
  if (game.status !== "final" || game.awayScore === null || game.homeScore === null) return 0;
  const selectedIsAway = pick.teamId === game.away.id;
  const selectedScore = selectedIsAway ? game.awayScore : game.homeScore;
  const otherScore = selectedIsAway ? game.homeScore : game.awayScore;
  return selectedScore > otherScore ? pick.spread : 0;
}

export function projectedPickPoints(pick: Pick, game: PoolGame): number {
  if (game.status !== "in_progress" || game.awayScore === null || game.homeScore === null) return 0;
  const selected = pick.teamId === game.away.id ? game.awayScore : game.homeScore;
  const opponent = pick.teamId === game.away.id ? game.homeScore : game.awayScore;
  return selected > opponent ? pick.spread : 0;
}
