"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card } from "./ui";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);
  const [iosSafari, setIosSafari] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    if (isInstalled() || sessionStorage.getItem("gameday-install-dismissed")) return;
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform("ios");
      setIosSafari(/safari/.test(userAgent) && !/crios|fxios|edgios|opios/.test(userAgent));
    }
    if (/android/.test(userAgent)) setPlatform("android");
    setDismissed(false);
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setPlatform("android");
    };
    const handleInstalled = () => { setDeferredPrompt(null); setDismissed(true); };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => { sessionStorage.setItem("gameday-install-dismissed", "1"); setDismissed(true); };
  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setDismissed(true);
    setDeferredPrompt(null);
  };

  if (dismissed || !platform || (platform === "android" && !deferredPrompt)) return null;
  return <aside aria-label="Install GameDay" className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md md:bottom-5"><Card className="relative border-[hsl(var(--primary)/.4)] bg-[hsl(var(--elevated)/.98)] p-4 shadow-2xl"><button aria-label="Dismiss install prompt" className="focus-ring absolute right-3 top-3 rounded-lg p-1 text-[hsl(var(--muted))] hover:text-white" onClick={dismiss}><X size={18}/></button><div className="pr-7"><p className="font-black">Add GameDay to your home screen</p>{platform === "ios" ? <p className="mt-1 text-sm leading-5 text-[hsl(var(--muted))]">{iosSafari ? <>In Safari, tap <Share className="inline align-text-bottom" size={15}/> Share, then choose <strong className="text-white">Add to Home Screen</strong>.</> : <>Open this link in Safari, then use <strong className="text-white">Share → Add to Home Screen</strong>.</>}</p> : <p className="mt-1 text-sm leading-5 text-[hsl(var(--muted))]">Install GameDay for full-screen, one-tap access on game day.</p>}</div>{platform === "android" && <Button type="button" className="mt-4 w-full" onClick={install}><Download className="mr-2" size={16}/>Install GameDay</Button>}</Card></aside>;
}
