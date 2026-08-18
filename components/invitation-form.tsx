"use client";
import { useActionState } from "react";
import { createInvitation, type InvitationState } from "@/app/actions/pool";
import { Button, Card } from "./ui";

const initialState: InvitationState = {};
export function InvitationForm({ poolId }: { poolId: string }) { const [state, action, pending]=useActionState(createInvitation,initialState); return <Card className="p-5"><h2 className="font-black">Invite players</h2><p className="mt-1 text-sm text-[hsl(var(--muted))]">New members must be approved before they can play.</p><form action={action} className="mt-4"><input type="hidden" name="poolId" value={poolId}/><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invitation"}</Button></form>{state.token && <div className="mt-4 rounded-xl bg-[hsl(var(--primary)/.1)] p-3"><p className="text-xs font-bold text-[hsl(var(--muted))]">Copy and share this invitation token</p><p className="mt-2 break-all font-mono text-sm font-bold text-[hsl(var(--primary))]">{state.token}</p></div>}{state.error && <p className="mt-3 text-sm text-red-200">{state.error}</p>}</Card>; }
