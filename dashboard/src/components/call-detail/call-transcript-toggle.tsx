"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptViewer } from "@/components/transcript-viewer";

export function CallTranscriptToggle({
  fetchTranscript,
}: {
  fetchTranscript: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState<string | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Cache after first fetch: undefined = never loaded, null = loaded-but-empty.
    // Re-opening must not re-hit the transcript endpoint (separate auth scope).
    if (transcript !== undefined) return;
    setError(null);
    startTransition(async () => {
      try {
        const text = await fetchTranscript();
        setTranscript(text ?? null);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to load transcript. Please try again.",
        );
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Transcript
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggle}
          disabled={isPending}
          aria-expanded={open}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Loading…
            </>
          ) : open ? (
            <>
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
              Hide transcript
            </>
          ) : (
            <>
              <ChevronRight className="mr-1 h-3.5 w-3.5" />
              Show transcript
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!open ? (
          <p className="text-xs text-muted-foreground">
            Transcript is fetched on-demand. Click{" "}
            <strong className="font-medium text-foreground">
              Show transcript
            </strong>{" "}
            to load it. Default is metadata-only — Bearer auth alone never
            returns transcript bytes.
          </p>
        ) : isPending && transcript === undefined ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Fetching transcript…
            </span>
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <TranscriptViewer transcript={transcript} />
        )}
      </CardContent>
    </Card>
  );
}
