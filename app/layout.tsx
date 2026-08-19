import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { PwaInstallPrompt } from "@/components/pwa-install";
import { SiteFooter } from "@/components/site-footer";

const bodyFont = Barlow({ subsets: ["latin"], variable: "--font-sans", display: "swap", weight: ["400", "500", "600", "700", "800"] });
const displayFont = Barlow_Condensed({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700", "800", "900"] });

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
  return <html lang="en"><body className={`${bodyFont.variable} ${displayFont.variable} font-sans antialiased`}>{children}<SiteFooter/><PwaInstallPrompt/><Analytics/></body></html>;
}
