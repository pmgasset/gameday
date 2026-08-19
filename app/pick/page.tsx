import Link from "next/link";
import { CircleAlert, MessageCircle } from "lucide-react";
import { Header, BottomNav } from "@/components/navigation";
import { PickFlow } from "@/components/pick-flow";
import { Onboarding } from "@/components/onboarding";
import { Button, Card } from "@/components/ui";
import { requirePoolContext } from "@/lib/data/pool";

export default async function PickPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const context = await requirePoolContext();
  const params = await searchParams;
  if (!context.pool || !context.week) return <main className="min-h-screen"><Header weekNumber={context.week?.nfl_week}/><Onboarding pending={context.pendingPool}/><BottomNav/></main>;
  if (context.pickBlocked) return <main className="mx-auto min-h-screen max-w-5xl pb-24"><Header weekNumber={context.week.nfl_week}/><section className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-5 py-10"><Card className="w-full border-amber-400/35 bg-[hsl(var(--elevated))] p-7 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-200"><CircleAlert size={28}/></span><p className="eyebrow mt-5 text-amber-200">Pick access paused</p><h1 className="mt-2 text-3xl font-black">Contact the commissioner.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[hsl(var(--muted))]">Your pick access is temporarily paused. Please contact the commissioner to restore access before making a selection.</p><Link className="mt-6 inline-flex" href="/"><Button><MessageCircle className="mr-2" size={16}/>Return to home</Button></Link></Card></section><BottomNav/></main>;
  const currentPick = context.picks.find((pick) => pick.playerId === context.userId && context.games.some((game) => game.id === pick.gameId));
  return <main className="mx-auto min-h-screen max-w-5xl pb-24"><Header weekNumber={context.week.nfl_week}/><PickFlow poolId={context.pool.id} weekId={context.week.id} weekNumber={context.week.nfl_week} games={context.games} currentPick={currentPick} saved={params.saved === "1"} error={params.error}/><BottomNav/></main>;
}
