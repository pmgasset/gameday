import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("focus-ring inline-flex min-h-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-extrabold text-[hsl(var(--primary-foreground))] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45", className)} {...props} />;
}
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("surface rounded-2xl", className)} {...props} />; }
export function Pill({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", className)} {...props}>{children}</span>; }
