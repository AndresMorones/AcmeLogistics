import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";

import "@/app/globals.css";

import { CmdKProvider } from "@/components/cmdk/cmdk-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

// Three self-hosted Google fonts via `next/font` (zero runtime cost, no FOUT):
// Geist for UI, Geist Mono for default numerics, IBM Plex Mono only inside
// `.pit-surface` (Telemetry). Separate instances are intentional, not redundant.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-pit-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Acme Logistics — Carrier Operations",
  description: "Carrier capacity, on the line.",
};

// Root layout is intentionally chrome-light: no `<Header />` here. Each
// dashboard route renders its own header via `app/dashboard/layout.tsx`;
// adding a header at this level reintroduces a duplicated nav-bar regression.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider delayDuration={150}>
          <CmdKProvider />
          <div className="flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border">
              <div className="container flex items-center justify-between py-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-success"
                    aria-hidden
                  />
                  <span>Online</span>
                </span>
                <span>
                  Acme Logistics ·{" "}
                  <a
                    href="https://happyrobot.ai"
                    rel="noopener"
                    className="hover:text-foreground"
                  >
                    Powered by HappyRobot
                  </a>
                </span>
              </div>
            </footer>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
