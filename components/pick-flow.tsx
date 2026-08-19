"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { submitPick } from "@/app/actions/pool";
import type { LiveGame, LivePick } from "@/lib/data/pool";
import { formatEastern, weeklyPicksOpenAt } from "@/lib/domain/deadlines";
import { Button, Card, Pill } from "./ui";
import { TeamLogo } from "./team-logo";

export function PickFlow({ poolId, weekId, weekNumber, games, currentPick, saved, error }: { poolId: string; weekId: string; weekNumber: number; games: LiveGame[]; currentPick: LivePick | undefined; saved: boolean; error?: string }) {
  const [candidate, setCandidate] = useState<LiveGame | null>(null);
  const pickedGame = games.find((game) => game.id === currentPick?.gameId);

  return <>
    <section className="px-5 pt-4">
      <p className="eyebrow">Week {weekNumber} · Make your call</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Choose one underdog.</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[hsl(var(--muted))]">Pick a team to win outright. A win earns the spread shown; a loss or tie earns zero.</p>
    </section>
    {saved && <div className="mx-5 mt-5 rounded-xl bg-[hsl(var(--primary)/.12)] p-3 text-sm font-bold text-[hsl(var(--primary))]">Pick saved. You&apos;re all set.</div>}
    {error && <div className="mx-5 mt-5 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-200">{error}</div>}
    {currentPick && <section className="px-5 pt-6"><Card className="border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.08)] p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 text-[hsl(var(--primary))]"/><TeamLogo abbreviation={pickedGame?.underdog.abbreviation ?? "NFL"} label={pickedGame?.underdog.name ?? "Your underdog"} className="h-11 w-11"/><div><p className="eyebrow">Your current pick</p><p className="mt-1 font-black">{pickedGame ? `${pickedGame.underdog.city} ${pickedGame.underdog.name}` : "Your underdog"} +{currentPick.spread}</p><p className="text-sm text-[hsl(var(--muted))]">{pickedGame?.locked ? "Locked for this week." : "You can change this before the deadline."}</p></div></div></Card></section>}
    <section className="grid gap-4 px-5 py-6 md:grid-cols-2">{games.map((game) => <PickCard key={game.id} game={game} onPick={setCandidate}/>)}</section>
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

function PickCard({ game, onPick }: { game: LiveGame; onPick: (game: LiveGame) => void }) {
  const unavailableMessage = game.locked ? "Locked" : `Opens ${formatEastern(weeklyPicksOpenAt(new Date(game.kickoff)))}`;
  return <Card className="overflow-hidden p-4"><div className="mb-5 flex items-center justify-between"><Pill className="border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">Underdog</Pill><span className="text-xs font-semibold text-[hsl(var(--muted))]">{formatEastern(game.kickoff)}</span></div><p className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted))]">{game.away.name} at {game.home.name}</p><div className="mt-4 flex items-center gap-3"><TeamLogo abbreviation={game.underdog.abbreviation} label={`${game.underdog.city} ${game.underdog.name}`} className="h-16 w-16"/><span className="text-xs font-black text-[hsl(var(--muted))]">VS</span><TeamLogo abbreviation={game.favorite.abbreviation} label={`${game.favorite.city} ${game.favorite.name}`} className="h-12 w-12 opacity-75"/><div className="min-w-0 flex-1"><h2 className="truncate text-2xl font-black">{game.underdog.city} {game.underdog.name}</h2><p className="mt-1 truncate text-sm text-[hsl(var(--muted))]">vs {game.favorite.city} {game.favorite.name}</p></div><span className="text-3xl font-black text-[hsl(var(--primary))]">+{game.spread}</span></div><Button disabled={!game.available} onClick={() => onPick(game)} className="mt-5 w-full">{game.available ? `Pick ${game.underdog.name} +${game.spread}` : unavailableMessage}</Button></Card>;
}
