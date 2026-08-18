"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

export async function requestMagicLink(form: FormData) {
  const email = form.get("email");
  if (typeof email !== "string" || !email.includes("@")) redirect("/login?error=invalid-email");
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) redirect("/login?error=unavailable");
  redirect("/login?sent=1");
}
