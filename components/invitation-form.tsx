"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { createInvitation, type InvitationState } from "@/app/actions/pool";
import { Button, Card } from "./ui";

const initialState: InvitationState = {};

export function InvitationForm({ poolId }: { poolId: string }) {
  const [state, action, pending] = useActionState(createInvitation, initialState);
  const [copied, setCopied] = useState(false);
  const invitationUrl = useMemo(() => state.token && (typeof window === "undefined" ? state.token : `${window.location.origin}/join?token=${encodeURIComponent(state.token)}`), [state.token]);
  const shareUrl = invitationUrl ?? state.token;

  async function copyInvitation() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The visible read-only field remains available for browsers that block clipboard access.
    }
  }

  async function shareInvitation() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my GameDay pool", text: "Make your picks in my GameDay pool.", url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyInvitation();
  }

  return <Card className="p-5"><h2 className="font-black">Invite players</h2><p className="mt-1 text-sm text-[hsl(var(--muted))]">New members must be approved before they can play.</p><form action={action} className="mt-4"><input type="hidden" name="poolId" value={poolId} /><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invitation"}</Button></form>{state.token && <div className="mt-4 rounded-xl bg-[hsl(var(--primary)/.1)] p-3"><p className="text-xs font-bold text-[hsl(var(--muted))]">Share this private invitation link</p><input aria-label="Invitation link" className="mt-2 w-full rounded-lg border bg-black/20 p-2 font-mono text-xs font-bold text-[hsl(var(--primary))]" readOnly value={shareUrl} /><div className="mt-3 flex flex-wrap gap-2"><Button className="md:hidden" onClick={shareInvitation} type="button"><Share2 className="mr-2" size={16} />Share invite</Button><Button className="bg-white/10 text-white hover:bg-white/15" onClick={copyInvitation} type="button">{copied ? <Check className="mr-2" size={16} /> : <Copy className="mr-2" size={16} />}{copied ? "Copied" : "Copy link"}</Button></div><p className="mt-2 text-xs text-[hsl(var(--muted))]">On mobile, Share invite opens your device’s share sheet. Players sign in, request access, and remain pending until approved.</p></div>}{state.error && <p className="mt-3 text-sm text-red-200">{state.error}</p>}</Card>;
}
