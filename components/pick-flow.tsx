"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { CalendarCheck2, CheckCircle2, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { submitPick } from "@/app/actions/pool";
import type { LiveGame, LivePick } from "@/lib/data/pool";
import { effectivePickDeadline, formatEastern, type NflWeekWindow } from "@/lib/domain/deadlines";
import { Button, Card, Pill } from "./ui";
import { TeamLogo } from "./team-logo";

export function PickFlow({ poolId, weekId, weekNumber, seasonType = "regular", weekWindow, games, currentPick, saved, error }: { poolId: string; weekId: string; weekNumber: number; seasonType?: "preseason" | "regular" | "postseason"; weekWindow: NflWeekWindow | null; games: LiveGame[]; currentPick: LivePick | undefined; saved: boolean; error?: string }) {
  const [candidate, setCandidate] = useState<LiveGame | null>(null);
  const querySeasonType = useSearchParams().get("seasonType");
  const selectedSeasonType = querySeasonType === "preseason" || querySeasonType === "postseason" ? querySeasonType : seasonType;
  const pickedGame = games.find((game) => game.id === currentPick?.gameId);
  // Every game of the official NFL week shares one open time and one Sunday cutoff.
  const sundayCutoff = weekWindow ? new Date(weekWindow.globalDeadline) : null;
  const kickoffDeadlineGames = weekWindow ? games.filter((game) => effectivePickDeadline(new Date(game.kickoff), weekWindow) < weekWindow.globalDeadline) : games;
  const sundayCutoffGames = weekWindow ? games.filter((game) => effectivePickDeadline(new Date(game.kickoff), weekWindow) >= weekWindow.globalDeadline) : [];

  return <>
    <section className="px-5 pt-4">
      <p className="eyebrow">Week {weekNumber} · Make your call</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Choose one underdog.</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[hsl(var(--muted))]">Pick a team to win outright. A win earns the spread shown; a loss or tie earns zero.</p>
    </section>
    {saved && <div className="mx-5 mt-5 rounded-xl bg-[hsl(var(--primary)/.12)] p-3 text-sm font-bold text-[hsl(var(--primary))]">Pick saved. You&apos;re all set.</div>}
    {error && <div className="mx-5 mt-5 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-200">{error}</div>}
    {currentPick && <section className="px-5 pt-6"><Card className="border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.08)] p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 text-[hsl(var(--primary))]"/><TeamLogo abbreviation={pickedGame?.underdog.abbreviation ?? "NFL"} label={pickedGame?.underdog.name ?? "Your underdog"} className="h-11 w-11"/><div><p className="eyebrow">Your current pick</p><p className="mt-1 font-black">{pickedGame ? `${pickedGame.underdog.city} ${pickedGame.underdog.name}` : "Your underdog"} +{currentPick.spread}</p><p className="text-sm text-[hsl(var(--muted))]">{pickedGame?.locked ? "Locked for this week." : "You can change this before the deadline."}</p></div></div></Card></section>}
    {weekWindow && sundayCutoff && <WeekTimeline pickOpensAt={new Date(weekWindow.picksOpenAt)} sundayCutoff={sundayCutoff} kickoffDeadlineGames={kickoffDeadlineGames} sundayCutoffGames={sundayCutoffGames}/>}
    <PickGroup title="Locks at kickoff" description="These picks become visible to everyone when the individual game starts." games={kickoffDeadlineGames} week={weekWindow} onPick={setCandidate}/>
    <PickGroup title="Sunday 1:00 PM cutoff" description={sundayCutoff ? `Every remaining Sunday and Monday pick locks, and all picks become visible, at ${formatEastern(sundayCutoff)}.` : "Remaining picks follow the Sunday cutoff."} games={sundayCutoffGames} week={weekWindow} onPick={setCandidate}/>
    <AlertDialog.Root open={!!candidate} onOpenChange={(open) => !open && setCandidate(null)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"/>
        <AlertDialog.Content className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-3xl border border-white/10 bg-[hsl(var(--elevated))] p-6 shadow-2xl">
          <AlertDialog.Title className="text-xl font-black">Confirm Week {weekNumber} pick?</AlertDialog.Title>
          <AlertDialog.Description className="mt-5 flex items-center gap-3 rounded-2xl bg-black/20 p-4 text-sm text-[hsl(var(--muted))]">
            <TeamLogo abbreviation={candidate?.underdog.abbreviation ?? "NFL"} label={candidate?.underdog.name ?? "Selected team"} className="h-14 w-14"/>
            <span><span className="block text-2xl font-black text-white">{candidate?.underdog.city} {candidate?.underdog.name} <span className="text-[hsl(var(--primary))]">+{candidate?.spread}</span></span><span className="mt-2 block">{candidate && formatEastern(candidate.kickoff)}</span></span>
          </AlertDialog.Description>
          <form action={submitPick} className="mt-6 grid gap-3">
            <input type="hidden" name="poolId" value={poolId}/>
            <input type="hidden" name="weekId" value={weekId}/>
            <input type="hidden" name="week" value={weekNumber}/>
            <input type="hidden" name="seasonType" value={selectedSeasonType}/>
            <input type="hidden" name="gameId" value={candidate?.id ?? ""}/>
            <input type="hidden" name="teamId" value={candidate?.underdog.id ?? ""}/>
            <Button type="submit"><ShieldCheck size={16} className="mr-2"/>Confirm pick</Button>
            <AlertDialog.Cancel asChild><Button type="button" className="bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5">Cancel</Button></AlertDialog.Cancel>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </>;
}

function WeekTimeline({ pickOpensAt, sundayCutoff, kickoffDeadlineGames, sundayCutoffGames }: { pickOpensAt: Date; sundayCutoff: Date; kickoffDeadlineGames: LiveGame[]; sundayCutoffGames: LiveGame[] }) {
  return <section className="px-5 pt-6"><Card className="overflow-hidden p-0"><div className="border-b border-white/10 bg-[hsl(var(--primary)/.08)] px-5 py-4"><p className="eyebrow">Your week at a glance</p><h2 className="mt-1 text-xl font-black">Pick schedule</h2></div><ol className="divide-y divide-white/10"><TimelineItem icon={<CalendarCheck2 size={18}/>} label="Picks open" detail={`Spreads and picks are available ${formatEastern(pickOpensAt)}.`}/>{kickoffDeadlineGames.map((game) => <TimelineItem key={game.id} icon={<LockKeyhole size={18}/>} label={`${game.away.abbreviation} at ${game.home.abbreviation}`} detail={`Locks and becomes visible at kickoff · ${formatEastern(new Date(game.kickoff))}.`}/>) }{sundayCutoffGames.length > 0 && <TimelineItem icon={<Eye size={18}/>} label="Sunday global cutoff" detail={`All remaining picks lock and every pick is visible ${formatEastern(sundayCutoff)}.`}/>}</ol></Card></section>;
}

function TimelineItem({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
  return <li className="flex gap-4 px-5 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]">{icon}</span><div><p className="font-black">{label}</p><p className="mt-1 text-sm leading-5 text-[hsl(var(--muted))]">{detail}</p></div></li>;
}

function PickGroup({ title, description, games, week, onPick }: { title: string; description: string; games: LiveGame[]; week: NflWeekWindow | null; onPick: (game: LiveGame) => void }) {
  if (!games.length) return null;
  return <section className="px-5 py-6"><div className="mb-4"><p className="eyebrow">Game deadline group</p><h2 className="mt-1 text-xl font-black">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[hsl(var(--muted))]">{description}</p></div><div className="grid gap-4 md:grid-cols-2">{games.map((game) => <PickCard key={game.id} game={game} week={week} onPick={onPick}/>)}</div></section>;
}

function PickCard({ game, week, onPick }: { game: LiveGame; week: NflWeekWindow | null; onPick: (game: LiveGame) => void }) {
  const unavailableMessage = game.locked || !week ? "Locked" : `Opens ${formatEastern(week.picksOpenAt)}`;
  const deadline = week ? effectivePickDeadline(new Date(game.kickoff), week) : new Date(game.kickoff);
  return <Card className="overflow-hidden p-4"><div className="mb-5 flex items-center justify-between"><Pill className="border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">Underdog</Pill><span className="text-right text-xs font-semibold text-[hsl(var(--muted))]">{formatEastern(game.kickoff)}</span></div><p className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted))]">{game.away.name} at {game.home.name}</p><div className="mt-4 flex items-center gap-3"><TeamLogo abbreviation={game.underdog.abbreviation} label={`${game.underdog.city} ${game.underdog.name}`} className="h-16 w-16"/><span className="text-xs font-black text-[hsl(var(--muted))]">VS</span><TeamLogo abbreviation={game.favorite.abbreviation} label={`${game.favorite.city} ${game.favorite.name}`} className="h-12 w-12 opacity-75"/><div className="min-w-0 flex-1"><h2 className="truncate text-2xl font-black">{game.underdog.city} {game.underdog.name}</h2><p className="mt-1 truncate text-sm text-[hsl(var(--muted))]">vs {game.favorite.city} {game.favorite.name}</p></div><span className="text-3xl font-black text-[hsl(var(--primary))]">+{game.spread}</span></div><p className="mt-5 rounded-xl bg-black/15 px-3 py-2 text-xs font-semibold leading-5 text-[hsl(var(--muted))]">Locks &amp; reveals: {formatEastern(deadline)}</p><Button disabled={!game.available} onClick={() => onPick(game)} className="mt-3 w-full">{game.available ? `Pick ${game.underdog.name} +${game.spread}` : unavailableMessage}</Button></Card>;
}
