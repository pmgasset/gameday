import Link from "next/link";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { signInWithPassword, signUpWithPassword } from "./actions";
import { Button, Card } from "@/components/ui";

type LoginParams = { created?: string; error?: string };

const messages: Record<string, string> = {
  "invalid-email": "Enter a valid email address.",
  "weak-password": "Your password must be at least 8 characters.",
  "invalid-credentials": "That email or password is not correct.",
  "signup-unavailable": "We couldn’t create that account. Try another email or try again shortly.",
  "invalid-link": "That confirmation link is invalid or has expired.",
  unavailable: "Authentication is temporarily unavailable.",
};

function CredentialsForm({ action, submitLabel, create = false }: { action: (form: FormData) => Promise<void>; submitLabel: string; create?: boolean }) {
  return <form action={action} className="grid gap-3">
    <label className="text-sm font-bold" htmlFor={create ? "signup-email" : "signin-email"}>Email address</label>
    <input className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm" id={create ? "signup-email" : "signin-email"} required type="email" name="email" autoComplete="email" placeholder="you@example.com" />
    <label className="text-sm font-bold" htmlFor={create ? "signup-password" : "signin-password"}>Password</label>
    <input className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm" id={create ? "signup-password" : "signin-password"} required minLength={8} type="password" name="password" autoComplete={create ? "new-password" : "current-password"} placeholder="At least 8 characters" />
    <Button type="submit">{create ? <UserPlus className="mr-2" size={16} /> : <KeyRound className="mr-2" size={16} />}{submitLabel}</Button>
  </form>;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginParams> }) {
  const params = await searchParams;
  return <main className="grid min-h-screen place-items-center px-5 py-10"><Card className="w-full max-w-md p-6"><Link className="text-xl font-black" href="/">GAME<span className="text-[hsl(var(--primary))]">DAY</span></Link><h1 className="mt-8 text-3xl font-black">Get in the game.</h1><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted))]">Sign in to make your weekly pick and follow your private pool.</p>{params.created && <div className="mt-6 rounded-xl bg-[hsl(var(--primary)/.12)] p-4 text-sm font-bold text-[hsl(var(--primary))]">Account created. Check your email to confirm it, then sign in.</div>}{params.error && <p className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{messages[params.error] ?? "Something went wrong. Please try again."}</p>}<div className="mt-7"><CredentialsForm action={signInWithPassword} submitLabel="Sign in" /></div><div className="my-7 border-t" /><h2 className="text-lg font-black">New to GameDay?</h2><p className="mt-1 text-sm text-[hsl(var(--muted))]">Create an account with an email and password.</p><div className="mt-4"><CredentialsForm action={signUpWithPassword} submitLabel="Create account" create /></div><p className="mt-7 flex gap-2 text-xs leading-5 text-[hsl(var(--muted))]"><ShieldCheck className="shrink-0 text-[hsl(var(--primary))]" size={16} />GameDay is private. Your invitation becomes a membership request after you sign in.</p></Card></main>;
}
