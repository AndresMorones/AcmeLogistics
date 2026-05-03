"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { AcmeMark } from "@/components/branding/AcmeMark";
import { NAV, isActive } from "@/components/sidebar";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNav(): React.JSX.Element {
  const pathname = usePathname() ?? "/dashboard";
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const drawerId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close drawer when route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc to close + focus trap (Tab / Shift+Tab cycle within drawer).
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusables = drawer.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Body scroll lock + focus first link on open; restore focus to trigger on close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    const firstLink = drawer?.querySelector<HTMLElement>(FOCUSABLE);
    firstLink?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      buttonRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md",
          "border border-border bg-background/60 text-foreground",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls={drawerId}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          {/* Drawer */}
          <div
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className={cn(
              "fixed left-0 top-0 z-50 flex h-screen w-[260px] max-w-[80vw] flex-col",
              "border-r border-border bg-background shadow-xl",
            )}
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <span
                id={headingId}
                className="inline-flex items-center gap-2 text-sm font-medium"
              >
                <AcmeMark height={28} className="text-foreground" />
                <span className="sr-only">Primary navigation</span>
              </span>
              <button
                type="button"
                onClick={close}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
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
          </div>
        </div>
      ) : null}
    </>
  );
}
