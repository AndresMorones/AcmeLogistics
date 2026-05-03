"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveRefresh(): null {
  const router = useRouter();

  useEffect(() => {
    // `cancelled` guards every async resume point so a Strict-Mode double-mount or fast unmount can't leak a second EventSource.
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let backoff = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect(): Promise<void> {
      if (cancelled) return;
      try {
        const res = await fetch("/api/events/session", { method: "POST" });
        if (!res.ok) throw new Error(`session ${res.status}`);
        const { session_token: token } = (await res.json()) as {
          session_token: string;
        };
        if (cancelled) return;

        eventSource = new EventSource(
          `/api/events/stream?session=${encodeURIComponent(token)}`,
        );

        // Server fans out `call-ended` once a webhook lands; router.refresh re-runs server components so KPIs/tables pick up the new row without a full reload.
        eventSource.addEventListener("call-ended", () => {
          router.refresh();
        });

        eventSource.onopen = () => {
          backoff = 1000;
        };

        // Exponential backoff capped at 30s — keeps the proxy quiet during outages but recovers within a tab-switch when the stream returns.
        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;
          if (cancelled) return;
          retryTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        };
      } catch {
        if (cancelled) return;
        retryTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      eventSource?.close();
    };
  }, [router]);

  return null;
}
