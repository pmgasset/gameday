"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { openWeek } from "@/app/actions/pool";
import { Button } from "@/components/ui";

type StartingSeason = "preseason" | "regular";

export function SetupStartWeekForm({ poolId }: { poolId: string }) {
  const [seasonType, setSeasonType] = useState<StartingSeason>("regular");
  const isPreseason = seasonType === "preseason";
  const maxWeek = isPreseason ? 4 : 18;

  return (
    <form action={openWeek} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="setup" value="1" />
      <label className="grid gap-1 text-xs font-bold text-[hsl(var(--muted))]" htmlFor="setup-season-type">
        Season phase
        <select className="focus-ring min-h-11 rounded-xl border bg-black/20 px-3 text-sm text-white" id="setup-season-type" name="seasonType" onChange={(event) => setSeasonType(event.target.value as StartingSeason)} value={seasonType}>
          <option value="preseason">Preseason · Weeks 1–4</option>
          <option value="regular">Regular season · Weeks 1–18</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-[hsl(var(--muted))]" htmlFor="setup-week">
        Starting week
        <input className="focus-ring min-h-11 w-full rounded-xl border bg-black/20 px-3 text-sm" defaultValue={1} id="setup-week" key={seasonType} max={maxWeek} min="1" name="week" required type="number" />
      </label>
      <Button type="submit"><CalendarDays className="mr-2" size={16} />Create & import</Button>
      <p className="sm:col-span-3 text-xs leading-5 text-[hsl(var(--muted))]">{isPreseason ? "Preseason uses Weeks 1–4." : "Regular season uses Weeks 1–18."} You can prepare more weeks from the commissioner dashboard later.</p>
    </form>
  );
}
