import Link from "next/link";
import { ArrowRight, EyeOff, Target, Trophy } from "lucide-react";
import { formatEastern, type NflWeekWindow } from "@/lib/domain/deadlines";
import { Button, Card } from "./ui";

const RULES = [
  { icon: Target, title: "Pick one underdog", body: "Each week you choose a single underdog from the games your commissioner has lined." },
  { icon: Trophy, title: "It has to win outright", body: "No spread covering. If your underdog wins the game, you earn its spread as points." },
  { icon: EyeOff, title: "Nobody sees it early", body: "Your pick stays private until its game starts, or Sunday at 1:00 PM ET." }
];

/**
 * Shown to a member who has never picked in this pool. It is the landing spot
 * for the approval email, so it must stand on its own for someone who has not
 * seen the app before and may arrive before the first week is open.
 */
export function FirstPickGuide({ poolName, poolId, weekNumber, weekWindow, serverNow }: { poolName: string; poolId: string; weekNumber?: number; weekWindow: NflWeekWindow | null; serverNow: Date }) {
  const open = Boolean(weekNumber && weekWindow && serverNow >= weekWindow.picksOpenAt);
  const timing = !weekWindow ? "Your commissioner opens each NFL week on the Tuesday before its Sunday at 9:00 AM ET. The available underdogs appear here as soon as that happens."
    : open ? `Picks for Week ${weekNumber} lock ${formatEastern(weekWindow.globalDeadline)}, or at kickoff for any earlier game.`
    : `Week ${weekNumber} opens ${formatEastern(weekWindow.picksOpenAt)}. Come back then to choose your underdog.`;

  return <Card className="mx-5 mt-4 border-[hsl(var(--primary)/.35)] p-6 md:p-7">
    <p className="eyebrow">Welcome to {poolName}</p>
    <h2 className="mt-2 text-3xl font-black">You&apos;re in. Here&apos;s the whole game.</h2>
    <ol className="mt-6 grid gap-4 md:grid-cols-3">{RULES.map(({ icon: Icon, title, body }, index) => <li className="flex gap-3" key={title}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]"><Icon size={18}/></span>
      <span className="min-w-0"><span className="block font-black">{index + 1}. {title}</span><span className="mt-1 block text-sm leading-5 text-[hsl(var(--muted))]">{body}</span></span>
    </li>)}</ol>
    <p className="mt-6 text-sm leading-6 text-[hsl(var(--muted))]">{timing}</p>
    {open && <Link className="mt-5 inline-flex" href={`/pick?pool=${poolId}&week=${weekNumber}`}><Button>Make your first pick <ArrowRight className="ml-2" size={16}/></Button></Link>}
  </Card>;
}
