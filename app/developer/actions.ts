"use server";

import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

function text(form: FormData, name: string) { const value = form.get(name); return typeof value === "string" ? value : ""; }

export async function beginDeveloperImpersonation(form: FormData) {
  const targetUserId = text(form, "targetUserId");
  const db = await serverClient();
  const { data, error } = await db.rpc("begin_developer_impersonation", { p_target_user_id: targetUserId });
  if (error || !data) redirect(`/developer?error=${encodeURIComponent(error?.message ?? "Unable to start support session")}`);
  redirect(`/developer/session/${data}`);
}

export async function endDeveloperImpersonation(form: FormData) {
  const sessionId = text(form, "sessionId");
  const db = await serverClient();
  const { error } = await db.rpc("end_developer_impersonation", { p_session_id: sessionId });
  redirect(error ? `/developer?error=${encodeURIComponent(error.message)}` : "/developer?sessionEnded=1");
}
