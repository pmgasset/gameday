"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

function profilePath(params: Record<string, string>): string {
  return `/profile?${new URLSearchParams(params).toString()}`;
}

export async function updateDisplayName(form: FormData) {
  const value = form.get("displayName");
  const displayName = typeof value === "string" ? value.trim() : "";
  if (displayName.length < 1 || displayName.length > 60) redirect(profilePath({ error: "Your name must be between 1 and 60 characters." }));

  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
  if (error) redirect(profilePath({ error: "We couldn't save your name. Please try again." }));
  await supabase.auth.updateUser({ data: { display_name: displayName } });
  revalidatePath("/", "layout");
  redirect(profilePath({ nameSaved: "1" }));
}

export async function requestPasswordReset() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}` });
  if (error) redirect(profilePath({ error: "We couldn't send a reset email. Please try again." }));
  redirect(profilePath({ passwordReset: "1" }));
}

export async function updatePassword(form: FormData) {
  const passwordValue = form.get("password");
  const confirmationValue = form.get("confirmation");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmation = typeof confirmationValue === "string" ? confirmationValue : "";
  if (password.length < 8) redirect("/reset-password?error=weak-password");
  if (password !== confirmation) redirect("/reset-password?error=mismatch");

  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=expired");
  redirect(profilePath({ passwordChanged: "1" }));
}
