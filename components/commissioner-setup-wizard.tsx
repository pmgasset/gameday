import Link from "next/link";
import { CalendarDays, CheckCircle2, Circle, ClipboardList, Send, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { importSchedule, openWeek } from "@/app/actions/pool";
import { InvitationForm } from "@/components/invitation-form";
import { Button, Card, Pill } from "@/components/ui";
import type { PoolWeek, ScheduledGame } from "@/lib/data/pool";

type SetupWizardProps = {
  poolId: string;
  role: "commissioner" | "co_commissioner";
  week: PoolWeek | null;
  schedule: ScheduledGame[];
  activeMembers: number;
};

function Step({ complete, number, title, description, children }: { complete: boolean; number: number; title: string; description: string; children?: ReactNode }) {
  return <li className="flex gap-3"><span className={complete ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary)/.15)] text-[hsl(var(--primary))]" : "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-[hsl(var(--muted))]"}>{complete ? <CheckCircle2 size={18}/> : <span className="text-sm font-black">{number}</span>}</span><div className="min-w-0 flex-1"><p className="font-black">{title}</p><p className="mt-1 text-sm leading-6 text-[hsl(var(--muted))]">{description}</p>{children && <div className="mt-3">{children}</div>}</div></li>;
}

export function CommissionerSetupWizard({ poolId, role, week, schedule, activeMembers }: SetupWizardProps) {
  const missingLines = schedule.filter((game) => !game.hasLine).length;
  const scheduleReady = schedule.length > 0;
  const linesReady = scheduleReady && missingLines === 0;
  const ready = Boolean(week && week.status === "open" && linesReady);
  const setupWeek = week?.nfl_week ?? 1;

  return <Card className="mt-6 overflow-hidden border-[hsl(var(--primary)/.35)]"><div className="bg-[hsl(var(--primary)/.08)] p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.16)] text-[hsl(var(--primary))]"><ClipboardList size={20}/></span><div><div className="flex flex-wrap items-center gap-2"><p className="eyebrow">Commissioner setup guide</p>{ready && <Pill className="border-[hsl(var(--primary)/.35)] text-[hsl(var(--primary))]">Week ready</Pill>}</div><h2 className="mt-1 text-2xl font-black">{ready ? `Week ${week?.nfl_week} is ready for picks.` : "Build your first playable week."}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted))]">{role === "commissioner" ? "Follow these steps to get your pool on the board. Co-commissioners can complete the calendar and line steps too." : "You can help finish the schedule and game lines. The commissioner controls invitations and pool ownership."}</p></div></div></div><ol className="grid gap-5 p-5 md:grid-cols-2">
    <Step complete={Boolean(week)} number={1} title="Choose your starting week" description={week ? `Week ${week.nfl_week} is open for setup.` : "Start at Week 1, or enter the NFL week your pool is joining if you are starting later."}>{!week && <form action={openWeek} className="flex flex-wrap gap-3"><input type="hidden" name="poolId" value={poolId}/><input type="hidden" name="setup" value="1"/><label className="sr-only" htmlFor="setup-week">Starting NFL week</label><input className="focus-ring min-h-11 w-28 rounded-xl border bg-black/20 px-3 text-sm" defaultValue={setupWeek} id="setup-week" max="25" min="1" name="week" required type="number"/><Button type="submit"><CalendarDays className="mr-2" size={16}/>Create & import</Button></form>}</Step>
    <Step complete={scheduleReady} number={2} title="Load the official schedule" description={scheduleReady ? `${schedule.length} games imported for Week ${week?.nfl_week}.` : "Import the official NFL calendar before assigning underdogs and spreads."}>{week && !scheduleReady && <form action={importSchedule}><input type="hidden" name="poolId" value={poolId}/><input type="hidden" name="week" value={week.nfl_week}/><input type="hidden" name="setup" value="1"/><Button type="submit"><CalendarDays className="mr-2" size={16}/>Import schedule</Button></form>}</Step>
    <Step complete={linesReady} number={3} title="Set every game line" description={!scheduleReady ? "Lines unlock after the schedule is imported." : linesReady ? "Every imported game has an underdog and spread." : `${missingLines} game${missingLines === 1 ? "" : "s"} still need an underdog and spread.`}>{week && scheduleReady && !linesReady && <Link className="inline-flex" href={`/admin?week=${week.nfl_week}`}><Button><Circle className="mr-2" size={14}/>Review missing lines</Button></Link>}</Step>
    <Step complete={ready} number={4} title={role === "commissioner" ? "Invite your players" : "Confirm the pool is ready"} description={role === "commissioner" ? activeMembers > 1 ? `${activeMembers} active players are ready to participate.` : "Create a private invitation when you are ready to bring players in." : ready ? "The pool is ready for players to make picks." : "Finish the earlier steps, then the opening week is ready for the pool."}>{role === "commissioner" && linesReady && <InvitationForm poolId={poolId}/>} {ready && <Link className="inline-flex" href={`/pick?week=${week?.nfl_week}`}><Button className="bg-white/10 text-white hover:bg-white/15"><Send className="mr-2" size={16}/>Open player picks</Button></Link>}</Step>
  </ol><div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-[hsl(var(--muted))]"><UsersRound className="mr-2 inline text-[hsl(var(--primary))]" size={15}/>Active members automatically carry into future weeks. A commissioner or co-commissioner can return here anytime to prepare the next one.</div></Card>;
}
