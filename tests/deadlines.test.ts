import { describe, expect, it } from "vitest";
import { effectivePickDeadline, formatEastern, isPickAvailable, isPickLocked, isPickRevealed, nflWeekSunday, nflWeekWindow, type NflWeekWindow } from "@/lib/domain/deadlines";

/** Week 1 2026: a Wednesday opener, Thursday night, Sunday, and Monday night all share one NFL week. */
const openerWeek = ["2026-09-10T00:20:00Z", "2026-09-11T00:15:00Z", "2026-09-13T17:00:00Z", "2026-09-13T20:25:00Z", "2026-09-14T00:20:00Z", "2026-09-15T00:15:00Z"];
/** A conventional Thursday-through-Monday week. */
const midseasonWeek = ["2026-10-15T00:15:00Z", "2026-10-18T17:00:00Z", "2026-10-18T20:25:00Z", "2026-10-20T00:20:00Z"];

function windowFor(slate: string[]): NflWeekWindow {
  const week = nflWeekWindow(slate);
  if (!week) throw new Error("slate has no NFL week");
  return week;
}

describe("official NFL week calendar", () => {
  it("anchors a week on the Sunday its slate is played, not on each kickoff's calendar week", () => {
    expect(nflWeekSunday(openerWeek)?.toISOString()).toBe(new Date("2026-09-13T04:00:00.000Z").toISOString());
    expect(nflWeekSunday(midseasonWeek)?.toISOString()).toBe(new Date("2026-10-18T04:00:00.000Z").toISOString());
    expect(nflWeekSunday([])).toBeNull();
  });

  it("opens every game of one NFL week together, including a Wednesday opener that crosses the calendar week", () => {
    const week = windowFor(openerWeek);
    expect(week.picksOpenAt.toISOString()).toBe("2026-09-08T13:00:00.000Z");
    expect(week.globalDeadline.toISOString()).toBe("2026-09-13T17:00:00.000Z");
    for (const kickoff of openerWeek) {
      expect(isPickAvailable(new Date(kickoff), week, new Date("2026-09-08T12:59:59Z"))).toBe(false);
      expect(isPickAvailable(new Date(kickoff), week, new Date("2026-09-08T13:00:00Z"))).toBe(true);
    }
  });

  it("keeps a slate together no matter which calendar days its games fall on", () => {
    // Wednesday opener, Friday international game, Saturday, Sunday, and Monday night.
    const spread = windowFor(["2026-09-10T00:20:00Z", "2026-09-11T13:00:00Z", "2026-09-12T21:00:00Z", "2026-09-13T17:00:00Z", "2026-09-15T00:15:00Z"]);
    const opener = windowFor(openerWeek);
    expect(spread).toEqual(opener);
  });

  it("locks each game before Sunday 1 PM at its own kickoff", () => {
    const week = windowFor(openerWeek);
    for (const kickoff of ["2026-09-10T00:20:00Z", "2026-09-11T00:15:00Z"]) {
      expect(effectivePickDeadline(new Date(kickoff), week)).toEqual(new Date(kickoff));
      expect(isPickLocked(new Date(kickoff), week, new Date(kickoff))).toBe(true);
      expect(isPickRevealed(new Date(kickoff), week, new Date(kickoff))).toBe(true);
    }
  });

  it("locks and reveals Sunday afternoon, Sunday night, and Monday games at Sunday 1 PM Eastern", () => {
    const week = windowFor(openerWeek);
    for (const kickoff of ["2026-09-13T17:00:00Z", "2026-09-13T20:25:00Z", "2026-09-14T00:20:00Z", "2026-09-15T00:15:00Z"]) {
      expect(effectivePickDeadline(new Date(kickoff), week)).toEqual(new Date("2026-09-13T17:00:00Z"));
      expect(isPickLocked(new Date(kickoff), week, new Date("2026-09-13T16:59:59Z"))).toBe(false);
      expect(isPickRevealed(new Date(kickoff), week, new Date("2026-09-13T17:00:00Z"))).toBe(true);
    }
  });

  it("publishes a conventional week Tuesday at 9 AM Eastern", () => {
    const week = windowFor(midseasonWeek);
    expect(week.picksOpenAt.toISOString()).toBe("2026-10-13T13:00:00.000Z");
    expect(week.globalDeadline.toISOString()).toBe("2026-10-18T17:00:00.000Z");
    expect(effectivePickDeadline(new Date("2026-10-20T00:20:00Z"), week).toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });

  it("keeps Eastern wall-clock times across daylight saving and late-season Saturday slates", () => {
    const daylightSaving = windowFor(["2026-10-30T00:15:00Z", "2026-11-01T17:00:00Z", "2026-11-01T21:05:00Z", "2026-11-03T01:15:00Z"]);
    expect(daylightSaving.picksOpenAt.toISOString()).toBe("2026-10-27T13:00:00.000Z");
    expect(daylightSaving.globalDeadline.toISOString()).toBe("2026-11-01T18:00:00.000Z");
    const saturdayWeek = windowFor(["2026-12-26T18:00:00Z", "2026-12-27T18:00:00Z", "2026-12-27T21:25:00Z", "2026-12-29T01:15:00Z"]);
    expect(saturdayWeek.picksOpenAt.toISOString()).toBe("2026-12-22T14:00:00.000Z");
    expect(saturdayWeek.globalDeadline.toISOString()).toBe("2026-12-27T18:00:00.000Z");
  });

  it("ignores a rescheduled outlier when anchoring the week", () => {
    // A postponed game moved to the following Tuesday keeps its own week's Sunday.
    const week = windowFor([...midseasonWeek, "2026-10-21T00:15:00Z"]);
    expect(week.globalDeadline.toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });

  it("falls back sensibly while only part of a slate is imported", () => {
    expect(windowFor(["2026-09-10T00:20:00Z"]).globalDeadline.toISOString()).toBe("2026-09-13T17:00:00.000Z");
    expect(windowFor(["2026-09-11T00:15:00Z"]).globalDeadline.toISOString()).toBe("2026-09-13T17:00:00.000Z");
    expect(windowFor(["2026-09-15T00:15:00Z"]).globalDeadline.toISOString()).toBe("2026-09-13T17:00:00.000Z");
  });

  it("shows the full Eastern date on game cards", () => { expect(formatEastern("2026-09-10T00:20:00Z")).toBe("Wednesday, September 9, 2026 · 8:20 PM ET"); });
});
