"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";

/** Realtime only refreshes server-rendered truth; it never calculates scores in the browser. */
export function LiveRefresh() { const router=useRouter(); useEffect(()=>{const client=browserClient(); const channel=client.channel("gameday-live-games").on("postgres_changes",{event:"UPDATE",schema:"public",table:"games"},()=>router.refresh()).subscribe(); return ()=>{void client.removeChannel(channel);};},[router]); return <p className="flex items-center gap-1 text-xs font-bold text-[hsl(var(--muted))]"><Radio size={13} className="text-[hsl(var(--primary))]"/>Live updates connected when available</p>; }
