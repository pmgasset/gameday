import { describe, expect, it } from "vitest";
import { officialPickPoints, projectedPickPoints } from "@/lib/domain/scoring";
import { fixtureGames, fixturePicks } from "@/lib/fixtures/week";

describe("underdog scoring", () => { const pick=fixturePicks[0];
  it("awards the stored decimal spread only for an outright win",()=>{const game={...fixtureGames[1],status:"final" as const,awayScore:21,homeScore:17};expect(officialPickPoints(pick,game)).toBe(3.5);});
  it("awards zero for a loss or tie",()=>{for(const score of [[17,21],[20,20]] as const){const game={...fixtureGames[1],status:"final" as const,awayScore:score[0],homeScore:score[1]};expect(officialPickPoints(pick,game)).toBe(0);}});
  it("uses only presentation-only projections during an active game",()=>{const game={...fixtureGames[1],status:"in_progress" as const,awayScore:7,homeScore:3};expect(projectedPickPoints(pick,game)).toBe(3.5);expect(officialPickPoints(pick,game)).toBe(0);});
});
