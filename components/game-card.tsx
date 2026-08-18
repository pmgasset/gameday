"use client";
import { LockKeyhole, Radio } from "lucide-react";
import type { PoolGame } from "@/lib/domain/types";
import { formatEastern, isPickLocked } from "@/lib/domain/deadlines";
import { Button, Card, Pill } from "./ui";

export function UnderdogPickCard({ game, onPick }: { game: PoolGame; onPick: (game: PoolGame) => void }) {
  const underdog = game.underdogId === game.away.id ? game.away : game.home;
  const opponent = game.underdogId === game.away.id ? game.home : game.away;
  const locked = isPickLocked(new Date(game.kickoff), new Date("2026-10-14T18:00:00Z"));
  return <Card className="overflow-hidden p-4"><div className="mb-5 flex items-center justify-between"><Pill className="border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">Underdog</Pill><span className="text-xs font-semibold text-[hsl(var(--muted))]">{formatEastern(game.kickoff)}</span></div><p className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted))]">{game.away.shortName} at {game.home.shortName}</p><div className="mt-2 flex items-end justify-between"><div><h2 className="text-2xl font-black">{underdog.displayName}</h2><p className="mt-1 text-sm text-[hsl(var(--muted))]">vs {opponent.displayName}</p></div><span className="text-3xl font-black text-[hsl(var(--primary))]">+{game.spread}</span></div><Button disabled={locked} onClick={() => onPick(game)} className="mt-5 w-full gap-2">{locked ? <><LockKeyhole size={16}/> Locked</> : <><Radio size={16}/> Pick {underdog.shortName} +{game.spread}</>}</Button></Card>;
}
