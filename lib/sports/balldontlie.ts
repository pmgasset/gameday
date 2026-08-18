import type { ProviderGame, ProviderTeam, SportsProvider } from "./types";

const API = "https://api.balldontlie.io/nfl/v1";
type RawGame = { id: number; season: number; week: number; date: string; status: string; period?: number; time?: string; home_team: { id: number }; visitor_team: { id: number }; home_team_score?: number; visitor_team_score?: number };
function status(raw: string): ProviderGame["status"] { const v = raw.toLowerCase(); if (v.includes("final")) return "final"; if (v.includes("postpon")) return "postponed"; if (v.includes("cancel")) return "cancelled"; if (/q[1-4]|half|live|in progress/.test(v)) return "in_progress"; return "scheduled"; }
function game(raw: RawGame): ProviderGame { return { externalId:String(raw.id),season:raw.season,week:raw.week,homeExternalTeamId:String(raw.home_team.id),awayExternalTeamId:String(raw.visitor_team.id),kickoffAt:raw.date,status:status(raw.status),homeScore:raw.home_team_score ?? null,awayScore:raw.visitor_team_score ?? null,period:raw.period ? `Q${raw.period}` : undefined,clock:raw.time }; }

/** Adapter boundary: no BALLDONTLIE-shaped object leaves this module. */
export class BallDontLieSportsProvider implements SportsProvider {
  constructor(private readonly apiKey: string) {}
  private async request<T>(path: string): Promise<T> { const response = await fetch(`${API}${path}`, { headers:{ Authorization:this.apiKey }, cache:"no-store" }); if (!response.ok) throw new Error(`BALLDONTLIE ${response.status}`); return response.json() as Promise<T>; }
  async getTeams(): Promise<ProviderTeam[]> { const result = await this.request<{data:Array<{id:number;abbreviation:string;city:string;name:string;conference?:string;division?:string}>}>("/teams"); return result.data.map(t=>({externalId:String(t.id),abbreviation:t.abbreviation,city:t.city,name:t.name,conference:t.conference,division:t.division})); }
  async getWeekGames(season: number, week: number): Promise<ProviderGame[]> { const result = await this.request<{data:RawGame[]}>(`/games?seasons[]=${season}&weeks[]=${week}`); return result.data.map(game); }
  async getGame(externalId: string): Promise<ProviderGame | null> { const result = await this.request<{data:RawGame}>(`/games/${externalId}`); return result.data ? game(result.data) : null; }
}
