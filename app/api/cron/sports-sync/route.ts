import { NextRequest, NextResponse } from "next/server";
import { BallDontLieSportsProvider } from "@/lib/sports/balldontlie";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  const key=process.env.BALLDONTLIE_API_KEY; if(!key) return NextResponse.json({error:"Provider not configured"},{status:503});
  const db=adminClient(); const attempt=(await db.from("provider_syncs").insert({provider:"balldontlie"}).select("id").single()).data;
  try { const {data:games,error}=await db.from("games").select("id,provider_game_id,nfl_season,nfl_week,manual_override").in("status",["scheduled","in_progress"]); if(error) throw error; const provider=new BallDontLieSportsProvider(key); let affected=0;
    for (const local of games ?? []) { const remote=await provider.getGame(local.provider_game_id); if(!remote || local.manual_override) continue; const {error:updateError}=await db.from("games").update({kickoff_at:remote.kickoffAt,status:remote.status,home_score:remote.homeScore,away_score:remote.awayScore,period:remote.period ?? null,game_clock:remote.clock ?? null,provider_synced_at:new Date().toISOString()}).eq("id",local.id); if(updateError) throw updateError; if(remote.status === "final") await db.rpc("score_final_game",{p_game_id:local.id}); affected++; }
    if(attempt) await db.from("provider_syncs").update({succeeded_at:new Date().toISOString(),affected_games:affected}).eq("id",attempt.id); return NextResponse.json({ok:true,affected});
  } catch (cause) { if(attempt) await db.from("provider_syncs").update({error_message:cause instanceof Error ? cause.message : "Unknown sync error"}).eq("id",attempt.id); return NextResponse.json({ok:false},{status:502}); }
}
