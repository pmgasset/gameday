export function SiteFooter() {
  return <footer className="mt-10 border-t border-white/10 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:pb-8">
    <div className="mx-auto max-w-5xl text-xs leading-5 text-[hsl(var(--muted))]">
      <p className="eyebrow">Data sources</p>
      <p className="mt-2 max-w-3xl">Schedules, kickoff times, and game status are supplied by <a className="focus-ring font-bold text-white hover:text-[hsl(var(--primary))]" href="https://nfl.balldontlie.io/" rel="noreferrer" target="_blank">BALLDONTLIE NFL</a>. Spreads are sourced through <a className="focus-ring font-bold text-white hover:text-[hsl(var(--primary))]" href="https://therundown.io/docs/quickstart" rel="noreferrer" target="_blank">TheRundown</a>, with DraftKings as the primary source and FanDuel or BetMGM used when available.</p>
      <p className="mt-2">Lines are provided for private pool play only and are not betting advice.</p>
    </div>
  </footer>;
}
