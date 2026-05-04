"use client";

import { useEffect, useState } from "react";

import { CmdKPalette } from "./cmdk-palette";

// Mount once at the root layout: a second mount would double-toggle on every keystroke since both instances bind the same listener.
export function CmdKProvider() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl+K is the de-facto palette shortcut (Slack, Linear, GitHub); preventDefault overrides Chrome's address-bar search jump.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        if (isTypingTarget(e.target)) return;
        setOpen((o) => (o ? false : o));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <CmdKPalette open={open} onOpenChange={setOpen} />;
}
