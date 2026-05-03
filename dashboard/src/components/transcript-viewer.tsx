"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ~10k chars ≈ 5-minute call — covers the typical case fully while keeping
// first-paint snappy on outlier 30-min calls; user opts in to the rest via Show more.
const TRUNCATE_AT = 10_000;

const SPEAKER_LINE_RE = /^\s*(agent|assistant|bot|carrier|caller|customer|user)\s*[:\-]/i;

type Turn = { speaker: string | null; text: string };

function parseTurns(transcript: string): Turn[] {
  const lines = transcript.split(/\r?\n/);
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const line of lines) {
    const m = line.match(SPEAKER_LINE_RE);
    if (m) {
      if (current) turns.push(current);
      const idx = line.indexOf(":");
      const dashIdx = line.indexOf("-");
      const splitAt =
        idx >= 0 && (dashIdx < 0 || idx < dashIdx) ? idx : dashIdx;
      const speaker =
        splitAt >= 0 ? line.slice(0, splitAt).trim() : m[1] ?? null;
      const text = splitAt >= 0 ? line.slice(splitAt + 1).trim() : "";
      current = { speaker, text };
    } else if (current) {
      current.text += (current.text ? "\n" : "") + line;
    } else {
      if (line.trim()) turns.push({ speaker: null, text: line });
    }
  }
  if (current) turns.push(current);
  return turns;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const re = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = text.split(re);
  const lower = query.toLowerCase();
  return parts.map((p, i) =>
    p.toLowerCase() === lower ? (
      <mark
        key={i}
        className="rounded-sm bg-yellow-200 px-0.5 text-foreground"
      >
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function TranscriptViewer({
  transcript,
}: {
  transcript: string | null | undefined;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const turns = useMemo<Turn[]>(() => {
    if (!transcript) return [];
    return parseTurns(transcript);
  }, [transcript]);

  const isStructured = turns.length > 1 && turns.some((t) => t.speaker);
  const isLong = (transcript?.length ?? 0) > TRUNCATE_AT;

  const filteredTurns = useMemo<Turn[]>(() => {
    if (!query) return turns;
    const q = query.toLowerCase();
    return turns.filter((t) => t.text.toLowerCase().includes(q));
  }, [turns, query]);

  if (!transcript || transcript.trim() === "") {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No transcript captured for this call.
      </div>
    );
  }

  const displayText =
    !expanded && isLong ? transcript.slice(0, TRUNCATE_AT) : transcript;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript..."
            className="pl-8"
            aria-label="Search transcript"
          />
        </div>
        {isStructured && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Collapse all" : "Expand all"}
          </Button>
        )}
      </div>

      {isStructured ? (
        <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/20 p-4">
          {filteredTurns.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No turns match your search.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {(expanded
                ? filteredTurns
                : filteredTurns.slice(0, 50)
              ).map((t, i) => (
                <li key={i} className="grid grid-cols-[80px_1fr] gap-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t.speaker ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "whitespace-pre-wrap font-mono text-xs leading-relaxed",
                    )}
                  >
                    {highlight(t.text, query)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!expanded && filteredTurns.length > 50 && (
            <div className="mt-3 text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(true)}
              >
                Show {filteredTurns.length - 50} more turns
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/20 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
            {highlight(displayText, query)}
          </pre>
          {isLong && (
            <div className="mt-3 text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded
                  ? "Show less"
                  : `Show more (${(
                      transcript.length - TRUNCATE_AT
                    ).toLocaleString()} chars hidden)`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
