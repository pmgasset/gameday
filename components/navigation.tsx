import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { PoolWeek } from "@/lib/data/pool";
import { MainNavigation } from "./main-navigation";
import { WeekSwitcher } from "./week-switcher";

export function Header({ weekNumber, weeks = [] }: { weekNumber?: number; weeks?: PoolWeek[] }) { return <header className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5"><Link href="/" className="focus-ring shrink-0 text-xl font-black tracking-tight">GAME<span className="text-[hsl(var(--primary))]">DAY</span></Link><MainNavigation variant="desktop"/><div className="ml-auto flex items-center gap-2"><WeekSwitcher currentWeek={weekNumber} weeks={weeks}/><details className="group relative"><summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl px-2 text-xs font-bold text-[hsl(var(--primary))] marker:content-none">Account<ChevronDown size={14} className="transition group-open:rotate-180"/></summary><div className="absolute right-0 z-30 mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-[hsl(var(--surface))] p-1 shadow-xl"><Link href="/profile" className="focus-ring flex min-h-10 items-center rounded-lg px-3 text-sm font-bold hover:bg-white/5">Profile</Link><Link href="/admin" className="focus-ring flex min-h-10 items-center rounded-lg px-3 text-sm font-bold hover:bg-white/5">Commissioner</Link><form action={signOut}><button type="submit" className="focus-ring flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-red-200 hover:bg-red-500/10"><LogOut size={15}/>Sign out</button></form></div></details></div></header>; }
export function BottomNav() { return <MainNavigation variant="mobile"/>; }
