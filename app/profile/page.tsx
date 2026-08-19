import { BottomNav, Header } from "@/components/navigation";
import { Button, Card, Pill } from "@/components/ui";
import { leavePool } from "@/app/actions/pool";
import { requirePoolContext } from "@/lib/data/pool";

type ProfileParams = { error?: string; week?: string };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<ProfileParams> }) {
  const params = await searchParams;
  const selectedWeek = Number(params.week);
  const context = await requirePoolContext(Number.isInteger(selectedWeek) ? selectedWeek : undefined);
  return <main className="mx-auto min-h-screen max-w-5xl pb-24"><Header weekNumber={context.week?.nfl_week} weeks={context.weeks}/><section className="px-5 pt-6"><p className="eyebrow">Your account</p><h1 className="mt-2 text-3xl font-black">Profile</h1>{params.error && <Card className="mt-5 border-red-500/40 p-4 text-sm text-red-200">{params.error}</Card>}<Card className="mt-6 p-5"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-full bg-[hsl(var(--primary))] font-black text-[hsl(var(--primary-foreground))]">{context.displayName.slice(0,2).toUpperCase()}</div><div><p className="font-black">{context.displayName}</p><p className="text-sm text-[hsl(var(--muted))]">{context.pool ? context.pool.name : context.pendingPool ? "Membership pending" : "No active pool"}</p>{context.pool && <Pill className="mt-2 text-[hsl(var(--primary))]">{context.pool.role.replace("_"," ")}</Pill>}</div></div></Card>{context.pool && context.pool.role !== "commissioner" && <Card className="mt-6 border-red-500/30 p-5"><h2 className="font-black">Leave this pool</h2><p className="mt-1 text-sm leading-6 text-[hsl(var(--muted))]">This permanently removes you from {context.pool.name}. You&apos;ll no longer participate in future weeks.</p><form action={leavePool} className="mt-4"><input type="hidden" name="poolId" value={context.pool.id}/><Button type="submit" className="bg-red-500 text-white hover:bg-red-400">Leave pool permanently</Button></form></Card>}</section><BottomNav/></main>;
}
