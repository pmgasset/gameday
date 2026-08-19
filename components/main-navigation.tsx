"use client";

import Link from "next/link";
import { Home, ShieldCheck, Trophy, UserRound, UsersRound } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/pick", label: "Pick", icon: ShieldCheck },
  { href: "/picks", label: "Picks", icon: UsersRound },
  { href: "/standings", label: "Standings", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function MainNavigation({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const week = searchParams.get("week");

  const hrefFor = (href: string) => week ? `${href}?week=${encodeURIComponent(week)}` : href;
  const activeFor = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "desktop") return <nav aria-label="Main navigation" className="hidden lg:block"><div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-black/15 p-1">{tabs.map(({ href, label, icon: Icon }) => { const active = activeFor(href); return <Link aria-current={active ? "page" : undefined} className={cn("focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition", active ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm" : "text-[hsl(var(--muted))] hover:bg-white/5 hover:text-white")} href={hrefFor(href)} key={href}><Icon size={17}/><span>{label}</span></Link>; })}</div></nav>;

  return <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[hsl(var(--background)/.96)] px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"><div className="mx-auto flex max-w-lg justify-between">{tabs.map(({ href, label, icon: Icon }) => { const active = activeFor(href); return <Link aria-current={active ? "page" : undefined} className={cn("focus-ring flex min-w-14 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition", active ? "bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]" : "text-[hsl(var(--muted))] hover:text-[hsl(var(--primary))]")} href={hrefFor(href)} key={href}><Icon size={19} strokeWidth={active ? 2.6 : 2}/>{label}</Link>; })}</div></nav>;
}
