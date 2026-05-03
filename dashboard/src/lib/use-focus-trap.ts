"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Focus-trap hook for modal regions.
 * - Saves the previously-focused element on mount.
 * - Focuses the first focusable descendant inside `containerRef`.
 * - Cycles Tab / Shift-Tab within the container.
 * - On unmount, restores focus to the previously-focused element.
 *
 * Esc handling stays with the caller (already wired in each modal).
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  active: boolean,
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = containerRef.current;
    if (!node) return;

    previouslyFocused.current =
      (document.activeElement as HTMLElement | null) ?? null;

    const focusables = (): HTMLElement[] =>
      Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );

    const initial = focusables();
    if (initial.length > 0) {
      initial[0].focus();
    } else {
      // Make container itself focusable as a fallback so focus is captured.
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !node.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [active, containerRef]);
}
