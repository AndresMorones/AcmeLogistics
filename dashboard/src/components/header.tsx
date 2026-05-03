"use client";

import { usePathname } from "next/navigation";

import { DateRangePicker } from "@/components/date-range-picker";
import { Wordmark } from "@/components/branding/Wordmark";
import { MobileNav } from "@/components/mobile-nav";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/dashboard\/calls\/[^/]+$/, title: "Call detail" },
  { match: /^\/dashboard\/calls\/?$/, title: "Calls" },
  { match: /^\/dashboard\/carriers\/[^/]+$/, title: "Carrier detail" },
  { match: /^\/dashboard\/carriers\/?$/, title: "Carriers" },
  { match: /^\/dashboard\/sales\/?$/, title: "New Bookings" },
  { match: /^\/dashboard\/?$/, title: "Monitor" },
];

function resolveTitle(pathname: string): string {
  for (const entry of PAGE_TITLES) {
    if (entry.match.test(pathname)) return entry.title;
  }
  return "";
}

export function Header(): React.JSX.Element {
  const pathname = usePathname() ?? "/dashboard";
  const title = resolveTitle(pathname);

  return (
    // Sticky so the date-range picker and page title stay reachable while long tables scroll; translucent so chart colors bleed through subtly.
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border",
        "bg-background/80 supports-[backdrop-filter]:bg-background/60",
        "backdrop-blur-md",
      )}
    >
      <div className="relative flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Hamburger drawer mounts only here — desktop sidebar handles nav at >=md, this fills the sub-md gap. */}
          <MobileNav />
          <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Wordmark />
        </div>
        <DateRangePicker />
      </div>
    </header>
  );
}
