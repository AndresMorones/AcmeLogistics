"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AcmeMark } from "@/components/branding/AcmeMark";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
};

// NAV + isActive are exported so the mobile drawer renders the same items and
// active-route logic as the desktop rail.
export const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Monitor" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/carriers", label: "Carriers" },
  { href: "/dashboard/sales", label: "New Bookings" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar(): React.JSX.Element {
  const pathname = usePathname() ?? "/dashboard";

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        "sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col",
        "border-r border-border bg-background/80 supports-[backdrop-filter]:bg-background/60",
        "backdrop-blur-md md:flex",
      )}
    >
      <div className="flex h-20 items-center justify-center border-b border-border px-3 py-2">
        <Link
          href="/dashboard"
          aria-label="Acme Logistics — Carrier Operations"
          className="inline-flex items-center"
        >
          <AcmeMark height={48} className="text-foreground" />
        </Link>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-md border-l-2 px-3 text-sm transition-colors",
                active
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Every timestamp, filter bucket, and chart axis renders in UTC; this
          chip surfaces that contract in the quietest chrome surface. */}
      <div
        className="mt-auto border-t border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground"
        title="All times shown in Coordinated Universal Time (UTC). Date filters and chart axes use UTC bounds."
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
          />
          All times in UTC
        </span>
      </div>
    </aside>
  );
}
