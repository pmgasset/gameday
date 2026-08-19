"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PoolWeek } from "@/lib/data/pool";

function label(week: PoolWeek): string { return `${week.season_type === "preseason" ? "Preseason " : week.season_type === "postseason" ? "Postseason " : ""}Week ${week.nfl_week}`; }

export function WeekSwitcher({ currentWeek, currentSeasonType, weeks }: { currentWeek?: number; currentSeasonType?: PoolWeek["season_type"]; weeks: PoolWeek[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!currentWeek) return <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-[hsl(var(--muted))]">NFL Pool</span>;
  if (weeks.length < 2) return <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-[hsl(var(--muted))]">Week {currentWeek}</span>;

  return <label className="rounded-full bg-white/5 px-1 text-xs font-bold text-[hsl(var(--muted))]"><span className="sr-only">Select pool week</span><select aria-label="Select pool week" className="focus-ring cursor-pointer appearance-none bg-transparent py-1 pl-2 pr-5 text-xs font-bold text-[hsl(var(--muted))]" onChange={(event) => { const [seasonType, week] = event.target.value.split(":"); const params = new URLSearchParams(searchParams.toString()); params.set("week", week); params.set("seasonType", seasonType); router.push(`${pathname}?${params.toString()}`); }} value={currentWeek === undefined ? "" : `${currentSeasonType ?? "regular"}:${currentWeek}`}>{weeks.map((week) => <option className="bg-[hsl(var(--surface))]" key={week.id} value={`${week.season_type}:${week.nfl_week}`}>{label(week)}{week.status === "complete" ? " · Final" : ""}</option>)}</select></label>;
}
