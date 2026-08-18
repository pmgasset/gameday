"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { PoolGame } from "@/lib/domain/types";
import { formatEastern } from "@/lib/domain/deadlines";
import { fixtureGames } from "@/lib/fixtures/week";
import { UnderdogPickCard } from "./game-card";
import { Button, Card } from "./ui";

export function PickFlow() {
  const [candidate, setCandidate] = useState<PoolGame | null>(null); const [saved, setSaved] = useState<PoolGame | null>(fixtureGames[1]);
  const team = candidate && (candidate.underdogId === candidate.away.id ? candidate.away : candidate.home);
  return <><section className="px-5 pt-4"><p className="eyebrow">Week 7 · Make your call</p><h1 className="mt-2 text-3xl font-black tracking-tight">Choose one underdog.</h1><p className="mt-2 max-w-lg text-sm leading-6 text-[hsl(var(--muted))]">Pick a team to win outright. A win earns the spread shown; a loss or tie earns zero.</p></section>{saved && <section className="px-5 pt-6"><Card className="border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.08)] p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 text-[hsl(var(--primary))]"/><div><p className="eyebrow">Your current pick</p><p className="mt-1 font-black">{saved.away.displayName} +{saved.spread}</p><p className="text-sm text-[hsl(var(--muted))]">Saved securely. Change it until its deadline.</p></div></div></Card></section>}<section className="grid gap-4 px-5 py-6 md:grid-cols-2">{fixtureGames.map(game => <UnderdogPickCard key={game.id} game={game} onPick={setCandidate}/>)}</section><AlertDialog.Root open={!!candidate} onOpenChange={open => !open && setCandidate(null)}><AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"/><AlertDialog.Content className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-3xl border border-white/10 bg-[hsl(var(--elevated))] p-6 shadow-2xl"><AlertDialog.Title className="text-xl font-black">Confirm Week 7 pick?</AlertDialog.Title><AlertDialog.Description className="mt-5 rounded-2xl bg-black/20 p-4 text-sm text-[hsl(var(--muted))]"><span className="block text-2xl font-black text-white">{team?.displayName} <span className="text-[hsl(var(--primary))]">+{candidate?.spread}</span></span><span className="mt-2 block">{candidate && formatEastern(candidate.kickoff)}</span></AlertDialog.Description><div className="mt-6 grid gap-3"><AlertDialog.Action asChild><Button onClick={() => { if (candidate) setSaved(candidate); setCandidate(null); }}><ShieldCheck size={16} className="mr-2"/>Confirm pick</Button></AlertDialog.Action><AlertDialog.Cancel asChild><Button className="bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5">Cancel</Button></AlertDialog.Cancel></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root></>;
}
