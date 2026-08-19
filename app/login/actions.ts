"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";

function credentials(form: FormData) {
  const email = form.get("email");
  const password = form.get("password");

  if (typeof email !== "string" || !email.includes("@")) redirect("/login?error=invalid-email");
  if (typeof password !== "string" || password.length < 8) redirect("/login?error=weak-password");
  return { email: email.trim(), password };
}

function returnPath(form: FormData): string {
  const value = form.get("next");
  return typeof value === "string" && value.startsWith("/join?token=") ? value : "/";
}

export async function signInWithPassword(form: FormData) {
  const { email, password } = credentials(form);
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect("/login?error=invalid-credentials");
  redirect(returnPath(form));
}

export async function signUpWithPassword(form: FormData) {
  const { email, password } = credentials(form);
  const next = returnPath(form);
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error) redirect("/login?error=signup-unavailable");
  // With Confirm email disabled Supabase creates a session immediately.
  if (data.session) redirect(next);
  redirect("/login?created=1");
}
