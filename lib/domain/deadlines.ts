import { DateTime } from "luxon";

export const POOL_TIME_ZONE = "America/New_York";
export const WEEKLY_PICKS_OPEN_HOUR = 9;
export const SUNDAY_GLOBAL_LOCK_HOUR = 13;

/** The pick window of one official NFL week, anchored on that week's Sunday. */
export type NflWeekWindow = { sunday: Date; picksOpenAt: Date; globalDeadline: Date };
export type Kickoff = Date | string;

function easternDay(kickoff: Kickoff): DateTime {
  return DateTime.fromJSDate(new Date(kickoff), { zone: "utc" }).setZone(POOL_TIME_ZONE).startOf("day");
}

/**
 * The Sunday that anchors an official NFL week.
 *
 * The slate is every kickoff the provider assigned to one `nfl_week`, so the
 * week's Sunday is the Eastern Sunday most of that slate is played on. A game's
 * own calendar week must never decide this: a Wednesday or Thursday opener and
 * the Monday nighter that closes the same NFL week fall in different calendar
 * weeks, and grouping by calendar week splits one slate into two pool weeks.
 */
export function nflWeekSunday(slate: Kickoff[]): Date | null {
  const days = slate.map(easternDay);
  if (!days.length) return null;
  const sundays = new Map<string, { day: DateTime; games: number }>();
  for (const day of days.filter((day) => day.weekday === 7)) {
    const key = day.toISODate() ?? "";
    sundays.set(key, { day, games: (sundays.get(key)?.games ?? 0) + 1 });
  }
  const busiest = [...sundays.values()].sort((a, b) => b.games - a.games || a.day.toMillis() - b.day.toMillis())[0];
  if (busiest) return busiest.day.toJSDate();
  // A partially imported slate with no Sunday game: a Monday or Tuesday kickoff
  // trails its Sunday, anything from Wednesday on leads the Sunday ahead of it.
  const earliest = days.reduce((first, day) => (day < first ? day : first));
  const sunday = earliest.weekday <= 2 ? earliest.minus({ days: earliest.weekday }) : earliest.plus({ days: 7 - earliest.weekday });
  return sunday.toJSDate();
}

/** Picks publish at 9:00 AM ET on the Tuesday before the NFL week's Sunday and lock at 1:00 PM ET that Sunday. */
export function nflWeekWindow(slate: Kickoff[]): NflWeekWindow | null {
  const anchor = nflWeekSunday(slate);
  if (!anchor) return null;
  const sunday = DateTime.fromJSDate(anchor, { zone: "utc" }).setZone(POOL_TIME_ZONE).startOf("day");
  return {
    sunday: sunday.toJSDate(),
    picksOpenAt: sunday.minus({ days: 5 }).set({ hour: WEEKLY_PICKS_OPEN_HOUR }).toJSDate(),
    globalDeadline: sunday.set({ hour: SUNDAY_GLOBAL_LOCK_HOUR }).toJSDate()
  };
}

/** The only source of pick/reveal timing. All callers must pass server time. */
export function effectivePickDeadline(kickoff: Date, week: NflWeekWindow): Date {
  return kickoff < week.globalDeadline ? kickoff : week.globalDeadline;
}

export function isPickLocked(kickoff: Date, week: NflWeekWindow, serverNow: Date): boolean { return serverNow >= effectivePickDeadline(kickoff, week); }
export function isPickAvailable(kickoff: Date, week: NflWeekWindow, serverNow: Date): boolean { return serverNow >= week.picksOpenAt && !isPickLocked(kickoff, week, serverNow); }
export function isPickRevealed(kickoff: Date, week: NflWeekWindow, serverNow: Date): boolean { return serverNow >= effectivePickDeadline(kickoff, week); }
export function formatEastern(instant: string | Date): string {
  return DateTime.fromJSDate(new Date(instant), { zone: "utc" })
    .setZone(POOL_TIME_ZONE)
    .toFormat("cccc, LLLL d, yyyy · h:mm a 'ET'");
}
