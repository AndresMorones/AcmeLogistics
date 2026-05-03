"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Route-segment error boundary: catches render errors below `app/`, logs once
// per occurrence, and exposes Next's `reset()` to retry the failed segment.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div>
        <h2 className="text-xl font-semibold">Something went wrong.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.message ?? "Unknown error rendering the dashboard."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
