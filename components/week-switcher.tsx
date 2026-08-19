"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PoolWeek } from "@/lib/data/pool";

export function WeekSwitcher({ currentWeek, weeks }: { currentWeek?: number; weeks: PoolWeek[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!currentWeek) return <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-[hsl(var(--muted))]">NFL Pool</span>;
  if (weeks.length < 2) return <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-[hsl(var(--muted))]">Week {currentWeek}</span>;

  return <label className="rounded-full bg-white/5 px-1 text-xs font-bold text-[hsl(var(--muted))]"><span className="sr-only">Select pool week</span><select aria-label="Select pool week" className="focus-ring cursor-pointer appearance-none bg-transparent py-1 pl-2 pr-5 text-xs font-bold text-[hsl(var(--muted))]" onChange={(event) => { const params = new URLSearchParams(searchParams.toString()); params.set("week", event.target.value); router.push(`${pathname}?${params.toString()}`); }} value={String(currentWeek)}>{weeks.map((week) => <option className="bg-[hsl(var(--surface))]" key={week.id} value={week.nfl_week}>Week {week.nfl_week}{week.status === "complete" ? " · Final" : ""}</option>)}</select></label>;
}
