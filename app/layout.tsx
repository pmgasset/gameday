import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaInstallPrompt } from "@/components/pwa-install";

export const metadata: Metadata = {
  title: "GameDay — UnderDog Pool",
  description: "Private NFL underdog pick'em",
  applicationName: "GameDay",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "GameDay" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#0d1422", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="font-sans antialiased">{children}<PwaInstallPrompt/></body></html>;
}
