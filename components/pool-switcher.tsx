"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ActivePool } from "@/lib/data/pool";

export function PoolSwitcher({ pools, selectedPoolId }: { pools: ActivePool[]; selectedPoolId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (pools.length < 2) return null;

  return <label className="max-w-36 rounded-full bg-white/5 px-1 text-xs font-bold text-[hsl(var(--muted))] sm:max-w-52">
    <span className="sr-only">Select pool</span>
    <select aria-label="Select pool" className="focus-ring w-full cursor-pointer appearance-none truncate bg-transparent py-1 pl-2 pr-5 text-xs font-bold text-[hsl(var(--muted))]" onChange={(event) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pool", event.target.value);
      params.delete("week");
      params.delete("seasonType");
      router.push(`${pathname}?${params.toString()}`);
    }} value={selectedPoolId ?? ""}>
      {pools.map((pool) => <option className="bg-[hsl(var(--surface))]" key={pool.id} value={pool.id}>{pool.name}</option>)}
    </select>
  </label>;
}
