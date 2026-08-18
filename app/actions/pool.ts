"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

export type InvitationState = { token?: string; error?: string };

function text(form: FormData, name: string): string { const value = form.get(name); return typeof value === "string" ? value : ""; }
function fail(error: { message: string } | null): never { redirect(`/?error=${encodeURIComponent(error?.message ?? "Unable to save your change")}`); }

export async function createPool(form: FormData) { const db=await serverClient(); const { error }=await db.rpc("create_pool",{p_name:text(form,"name")}); if(error) fail(error); revalidatePath("/"); redirect("/"); }
export async function submitPick(form: FormData) { const db=await serverClient(); const { error }=await db.rpc("submit_pick",{p_pool_id:text(form,"poolId"),p_week_id:text(form,"weekId"),p_game_id:text(form,"gameId"),p_team_id:text(form,"teamId")}); if(error) redirect(`/pick?error=${encodeURIComponent(error.message)}`); revalidatePath("/"); revalidatePath("/pick"); redirect("/pick?saved=1"); }
export async function moderateMember(form: FormData) { const db=await serverClient(); const {error}=await db.rpc("moderate_membership",{p_pool_id:text(form,"poolId"),p_user_id:text(form,"userId"),p_status:text(form,"status")}); if(error) fail(error); revalidatePath("/admin"); }
export async function changeMemberRole(form: FormData) { const db=await serverClient(); const {error}=await db.rpc("set_pool_member_role",{p_pool_id:text(form,"poolId"),p_user_id:text(form,"userId"),p_role:text(form,"role")}); if(error) fail(error); revalidatePath("/admin"); }
export async function redeemInvitation(form: FormData) { const db=await serverClient(); const {error}=await db.rpc("request_pool_membership",{p_token:text(form,"token")}); if(error) redirect(`/join?error=${encodeURIComponent(error.message)}`); redirect("/?requested=1"); }
export async function createInvitation(_: InvitationState, form: FormData): Promise<InvitationState> { const db=await serverClient(); const {data,error}=await db.rpc("create_invitation",{p_pool_id:text(form,"poolId")}); if(error) return {error:error.message}; const row=(data as unknown as Array<{token:string}> | null)?.[0]; if(!row) return {error:"Unable to create invitation"}; revalidatePath("/admin"); return {token:row.token}; }
export async function openWeek(form: FormData) { const db=await serverClient(); const {error}=await db.rpc("create_pool_week",{p_pool_id:text(form,"poolId"),p_week:Number(text(form,"week"))}); if(error) redirect(`/admin?error=${encodeURIComponent(error.message)}`); revalidatePath("/"); revalidatePath("/admin"); redirect("/admin"); }
export async function saveManualLine(form: FormData) { const db=await serverClient(); const kickoff=text(form,"kickoff"); const {error}=await db.rpc("upsert_manual_line",{p_pool_id:text(form,"poolId"),p_week_id:text(form,"weekId"),p_away_abbreviation:text(form,"away"),p_home_abbreviation:text(form,"home"),p_kickoff:new Date(kickoff).toISOString(),p_underdog_abbreviation:text(form,"underdog"),p_spread:Number(text(form,"spread"))}); if(error) redirect(`/admin?error=${encodeURIComponent(error.message)}`); revalidatePath("/"); revalidatePath("/pick"); revalidatePath("/admin"); redirect("/admin"); }
