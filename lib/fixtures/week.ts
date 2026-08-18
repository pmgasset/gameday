import type { Pick, PoolGame, Team } from "@/lib/domain/types";

const teams: Record<string, Team> = {
  nyj: { id: "nyj", abbreviation: "NYJ", displayName: "New York Jets", shortName: "Jets" },
  buf: { id: "buf", abbreviation: "BUF", displayName: "Buffalo Bills", shortName: "Bills" },
  gb: { id: "gb", abbreviation: "GB", displayName: "Green Bay Packers", shortName: "Packers" },
  det: { id: "det", abbreviation: "DET", displayName: "Detroit Lions", shortName: "Lions" },
  sea: { id: "sea", abbreviation: "SEA", displayName: "Seattle Seahawks", shortName: "Seahawks" },
  kc: { id: "kc", abbreviation: "KC", displayName: "Kansas City Chiefs", shortName: "Chiefs" },
  dal: { id: "dal", abbreviation: "DAL", displayName: "Dallas Cowboys", shortName: "Cowboys" },
  phi: { id: "phi", abbreviation: "PHI", displayName: "Philadelphia Eagles", shortName: "Eagles" }
};

export const fixtureGames: PoolGame[] = [
  { id:"g1",week:7,away:teams.nyj,home:teams.buf,kickoff:"2026-10-15T00:15:00.000Z",status:"scheduled",awayScore:null,homeScore:null,underdogId:"nyj",spread:7.5 },
  { id:"g2",week:7,away:teams.gb,home:teams.det,kickoff:"2026-10-18T17:00:00.000Z",status:"scheduled",awayScore:null,homeScore:null,underdogId:"gb",spread:3.5 },
  { id:"g3",week:7,away:teams.sea,home:teams.kc,kickoff:"2026-10-18T20:25:00.000Z",status:"scheduled",awayScore:null,homeScore:null,underdogId:"sea",spread:6.5 },
  { id:"g4",week:7,away:teams.dal,home:teams.phi,kickoff:"2026-10-20T00:20:00.000Z",status:"scheduled",awayScore:null,homeScore:null,underdogId:"dal",spread:4.5 }
];

export const fixturePicks: Pick[] = [
  { id:"p1",playerId:"me",playerName:"You",gameId:"g2",teamId:"gb",spread:3.5,submittedAt:"2026-10-14T15:00:00Z",points:null },
  { id:"p2",playerId:"m2",playerName:"Maya",gameId:"g1",teamId:"nyj",spread:7.5,submittedAt:"2026-10-14T15:00:00Z",points:null }
];
