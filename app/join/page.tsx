import Link from "next/link";
import { redirect } from "next/navigation";
import { redeemInvitation } from "@/app/actions/pool";
import { OpenInBrowserHelp } from "@/components/open-in-browser-help";
import { Button, Card } from "@/components/ui";
import { serverClient } from "@/lib/supabase/server";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ error?: string; token?: string }> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  if (!token) redirect("/");
  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  const loginPath = "/login?next=" + encodeURIComponent("/join?token=" + encodeURIComponent(token));
  if (!user) return <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-5 py-10"><Card className="w-full p-6"><p className="eyebrow">Private GameDay pool</p><h1 className="mt-2 text-3xl font-black">Join this pool</h1><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted))]">Sign in or create an account to request access to this private pool.</p><Link className="mt-6 inline-flex" href={loginPath}><Button>Sign in to continue</Button></Link><OpenInBrowserHelp token={token}/></Card></main>;

  return <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-5 py-10"><Card className="w-full p-6"><p className="eyebrow">Private GameDay pool</p><h1 className="mt-2 text-3xl font-black">Request to join</h1><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted))]">You&apos;re signed in as {user.email}. Send your request and the commissioner will approve you before picks and standings are visible.</p>{params.error && <p className="mt-5 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-200">{params.error}</p>}<form action={redeemInvitation} className="mt-6"><input type="hidden" name="token" value={token}/><Button type="submit">Request access</Button></form><OpenInBrowserHelp token={token}/></Card></main>;
}
