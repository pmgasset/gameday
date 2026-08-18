import { describe, expect, it } from "vitest";
import { effectivePickDeadline, isPickLocked, sundayGlobalDeadline } from "@/lib/domain/deadlines";

describe("authoritative pool deadlines", () => {
  it("locks Thursday at kickoff", () => { const kickoff=new Date("2026-10-15T00:15:00Z"); expect(effectivePickDeadline(kickoff)).toEqual(kickoff); expect(isPickLocked(kickoff,new Date("2026-10-15T00:15:00Z"))).toBe(true); });
  it("locks Sunday afternoon, night, and Monday at 1 PM Eastern", () => { const lock=new Date("2026-10-18T17:00:00Z"); for(const game of [new Date("2026-10-18T20:25:00Z"),new Date("2026-10-19T00:20:00Z"),new Date("2026-10-20T00:15:00Z")]) expect(effectivePickDeadline(game)).toEqual(lock); });
  it("uses the previous Sunday for Monday games and handles daylight saving", () => { expect(sundayGlobalDeadline(new Date("2026-11-03T01:15:00Z")).toISOString()).toBe("2026-11-01T18:00:00.000Z"); });
});
