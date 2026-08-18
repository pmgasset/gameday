import { cn } from "@/lib/utils";

const espnAbbreviations: Record<string, string> = {
  LA: "lar",
  WAS: "wsh",
};

export function TeamLogo({ abbreviation, label, className }: { abbreviation: string; label: string; className?: string }) {
  const code = espnAbbreviations[abbreviation.toUpperCase()] ?? abbreviation.toLowerCase();
  return <span className={cn("grid shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.06] p-1", className)} title={label}><img alt="" className="h-full w-full object-contain" height={64} loading="lazy" src={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`} width={64}/></span>;
}
