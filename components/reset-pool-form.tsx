"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";
import { resetPool } from "@/app/actions/pool";
import { Button, Card } from "./ui";

export function ResetPoolForm({ poolId }: { poolId: string }) {
  const [confirmation, setConfirmation] = useState("");

  return <Card className="mt-6 border-red-500/35 p-5">
    <p className="eyebrow text-red-300">Danger zone</p>
    <h2 className="mt-2 font-black">Reset pool gameplay</h2>
    <p className="mt-1 text-sm leading-6 text-[hsl(var(--muted))]">This removes picks, lines, weeks, seasons, and outstanding invitations. Your pool name and active members stay in place.</p>
    <AlertDialog.Root onOpenChange={(open) => !open && setConfirmation("")}>
      <AlertDialog.Trigger asChild><Button type="button" className="mt-4 bg-red-600 text-white hover:bg-red-500">Reset pool</Button></AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"/>
        <AlertDialog.Content className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-3xl border border-red-500/30 bg-[hsl(var(--elevated))] p-6 shadow-2xl">
          <AlertDialog.Title className="text-xl font-black">Reset this pool?</AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-[hsl(var(--muted))]">This cannot be undone. Type <strong className="text-white">RESET</strong> to remove all gameplay data while retaining members.</AlertDialog.Description>
          <form action={resetPool} className="mt-5 grid gap-3">
            <input type="hidden" name="poolId" value={poolId}/>
            <input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="focus-ring min-h-11 rounded-xl border border-red-500/35 bg-black/20 px-3 text-sm" placeholder="Type RESET"/>
            <Button type="submit" disabled={confirmation !== "RESET"} className="bg-red-600 text-white hover:bg-red-500">Permanently reset pool</Button>
            <AlertDialog.Cancel asChild><Button type="button" className="bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5">Cancel</Button></AlertDialog.Cancel>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </Card>;
}
