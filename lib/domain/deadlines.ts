import { DateTime } from "luxon";

export const POOL_TIME_ZONE = "America/New_York";
export const WEEKLY_PICKS_OPEN_HOUR = 9;

/** Picks publish at 9:00 AM ET on the Tuesday before the NFL week's Sunday. */
export function weeklyPicksOpenAt(kickoff: Date): Date {
  const localKickoff = DateTime.fromJSDate(kickoff, { zone: "utc" }).setZone(POOL_TIME_ZONE);
  const weekStart = localKickoff.startOf("week");
  const tuesday = localKickoff.weekday <= 3
    ? weekStart.minus({ days: 6 })
    : weekStart.plus({ days: 1 });
  return tuesday.set({ hour: WEEKLY_PICKS_OPEN_HOUR, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
}

/** The only source of pick/reveal timing. All callers must pass server time. */
export function sundayGlobalDeadline(kickoff: Date): Date {
  const localKickoff = DateTime.fromJSDate(kickoff, { zone: "utc" }).setZone(POOL_TIME_ZONE);
  const daysToSunday = (7 - localKickoff.weekday) % 7;
  const sunday = localKickoff.startOf("week").plus({ days: 6 + (localKickoff.weekday === 7 ? 0 : 0) });
  // NFL weeks start on Thursday. For a Monday game the Sunday is before it; for a Thursday game it is after it.
  const weeklySunday = localKickoff.weekday <= 3 ? sunday.minus({ weeks: 1 }) : sunday;
  return weeklySunday.set({ hour: 13, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
}

export function effectivePickDeadline(kickoff: Date): Date {
  const global = sundayGlobalDeadline(kickoff);
  return kickoff < global ? kickoff : global;
}

export function isPickLocked(kickoff: Date, serverNow: Date): boolean { return serverNow >= effectivePickDeadline(kickoff); }
export function isPickAvailable(kickoff: Date, serverNow: Date): boolean { return serverNow >= weeklyPicksOpenAt(kickoff) && !isPickLocked(kickoff, serverNow); }
export function isPickRevealed(kickoff: Date, serverNow: Date): boolean { return serverNow >= effectivePickDeadline(kickoff); }
export function formatEastern(instant: string | Date): string {
  return DateTime.fromJSDate(new Date(instant), { zone: "utc" }).setZone(POOL_TIME_ZONE).toFormat("ccc · h:mm a 'ET'");
}
