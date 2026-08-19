import Link from "next/link";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { signInWithPassword, signUpWithPassword } from "./actions";
import { Button, Card } from "@/components/ui";

type LoginParams = { created?: string; error?: string; next?: string; "logged-out"?: string };

const messages: Record<string, string> = {
  "invalid-email": "Enter a valid email address.",
  "weak-password": "Your password must be at least 8 characters.",
  "invalid-credentials": "That email or password is not correct.",
  "signup-unavailable": "We couldn’t create that account. Try another email or try again shortly.",
  "invalid-link": "That confirmation link is invalid or has expired.",
  unavailable: "Authentication is temporarily unavailable.",
};

function CredentialsForm({ action, submitLabel, create = false, next }: { action: (form: FormData) => Promise<void>; submitLabel: string; create?: boolean; next?: string }) {
  return <form action={action} className="grid gap-3">
    {next && <input type="hidden" name="next" value={next}/>}
    <label className="text-sm font-bold" htmlFor={create ? "signup-email" : "signin-email"}>Email address</label>
    <input className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm" id={create ? "signup-email" : "signin-email"} required type="email" name="email" autoComplete="email" placeholder="you@example.com" />
    <label className="text-sm font-bold" htmlFor={create ? "signup-password" : "signin-password"}>Password</label>
    <input className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm" id={create ? "signup-password" : "signin-password"} required minLength={8} type="password" name="password" autoComplete={create ? "new-password" : "current-password"} placeholder="At least 8 characters" />
    <Button type="submit">{create ? <UserPlus className="mr-2" size={16} /> : <KeyRound className="mr-2" size={16} />}{submitLabel}</Button>
  </form>;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginParams> }) {
  const params = await searchParams;
  return <main className="login-page min-h-screen px-5 py-6 md:grid md:place-items-center md:py-10"><div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[hsl(var(--surface)/.7)] shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_.95fr]"><section className="login-photo relative min-h-72 p-7 md:p-10"><div className="relative flex h-full max-w-sm flex-col justify-end"><Link className="focus-ring absolute left-0 top-0 text-xl font-black" href="/">GAME<span className="text-[hsl(var(--primary))]">DAY</span></Link><p className="eyebrow text-[hsl(var(--primary))]">One pick. All week.</p><h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">The best part of Sunday starts here.</h1><p className="mt-4 leading-7 text-slate-200">Call your underdog, track the pool, and let game day take it from there.</p></div></section><section className="flex items-center p-5 sm:p-8 md:p-10"><Card className="w-full border-white/10 bg-[hsl(var(--surface)/.82)] p-6 shadow-none"><Link className="focus-ring text-xl font-black lg:hidden" href="/">GAME<span className="text-[hsl(var(--primary))]">DAY</span></Link><h2 className="mt-8 text-3xl font-black lg:mt-0">Get in the game.</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted))]">Sign in to make your weekly pick and follow your private pool.</p>{params["logged-out"] && <div className="mt-6 rounded-xl bg-[hsl(var(--primary)/.12)] p-4 text-sm font-bold text-[hsl(var(--primary))]">You&apos;re signed out.</div>}{params.created && <div className="mt-6 rounded-xl bg-[hsl(var(--primary)/.12)] p-4 text-sm font-bold text-[hsl(var(--primary))]">Account created. Check your email to confirm it, then sign in.</div>}{params.error && <p className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{messages[params.error] ?? "Something went wrong. Please try again."}</p>}<div className="mt-7"><CredentialsForm action={signInWithPassword} submitLabel="Sign in" next={params.next} /></div><div className="my-7 border-t" /><h3 className="text-lg font-black">New to GameDay?</h3><p className="mt-1 text-sm text-[hsl(var(--muted))]">Create an account with an email and password.</p><div className="mt-4"><CredentialsForm action={signUpWithPassword} submitLabel="Create account" create next={params.next} /></div><p className="mt-7 flex gap-2 text-xs leading-5 text-[hsl(var(--muted))]"><ShieldCheck className="shrink-0 text-[hsl(var(--primary))]" size={16} />GameDay is private. Your invitation becomes a membership request after you sign in.</p></Card></section></div></main>;
}
