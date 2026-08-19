import Link from "next/link";
import { KeyRound } from "lucide-react";
import { redirect } from "next/navigation";
import { updatePassword } from "@/app/profile/actions";
import { Button, Card } from "@/components/ui";
import { serverClient } from "@/lib/supabase/server";

const messages: Record<string, string> = {
  "weak-password": "Your new password must be at least 8 characters.",
  mismatch: "Your passwords do not match.",
  expired: "That reset link is expired or invalid. Request another from your profile.",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  return <main className="login-page grid min-h-screen place-items-center px-5 py-10"><Card className="w-full max-w-md p-6 sm:p-8"><Link className="focus-ring text-xl font-black" href="/">GAME<span className="text-[hsl(var(--primary))]">DAY</span></Link><p className="eyebrow mt-9">Account security</p><h1 className="mt-2 text-3xl font-black">Set a new password</h1><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted))]">Choose a new password with at least eight characters.</p>{params.error && <p className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{messages[params.error] ?? "Something went wrong. Please try again."}</p>}<form action={updatePassword} className="mt-6 grid gap-3"><label className="text-sm font-bold" htmlFor="new-password">New password</label><input autoComplete="new-password" className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm" id="new-password" minLength={8} name="password" required type="password"/><label className="text-sm font-bold" htmlFor="confirm-password">Confirm new password</label><input autoComplete="new-password" className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm" id="confirm-password" minLength={8} name="confirmation" required type="password"/><Button type="submit"><KeyRound className="mr-2" size={16}/>Save new password</Button></form></Card></main>;
}
