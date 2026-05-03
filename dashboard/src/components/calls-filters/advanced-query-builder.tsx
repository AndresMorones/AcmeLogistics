"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  EMPTY_QUERY,
  ENUM_FIELD_VALUES,
  NUMERIC_FIELDS,
  NUMERIC_OPS,
  PREDICATE_FIELDS,
  STRING_OPS,
  isPredicateRowComplete,
  type AdvancedQuery,
  type AdvancedQueryMode,
  type Predicate,
  type PredicateField,
  type PredicateOp,
} from "./predicate-types";

const FIELD_LABELS: Record<PredicateField, string> = {
  mc_number: "MC #",
  carrier_name: "Carrier name",
  legal_name: "Legal name",
  call_outcome: "Call outcome",
  sentiment: "Sentiment",
  case_health_score: "Case health score",
  audit_remarks: "Audit remarks",
  fmcsa_eligibility_failure_reason: "FMCSA failure reason",
  callback_phone: "Callback phone",
  load_id: "Load ID",
  duration_seconds: "Duration (seconds)",
};

const OP_LABELS: Record<PredicateOp, string> = {
  LIKE: "contains",
  EQUALS: "equals",
  NOT_EQUALS: "not equals",
  ">=": ">=",
  "<=": "<=",
};

// Predicate AST is field-driven: numeric fields gain comparison ops, all
// others stay string-only — keeps the operator dropdown from offering
// nonsensical pairs like `carrier_name >= 5` that the backend would reject.
function opsForField(field: PredicateField): PredicateOp[] {
  return NUMERIC_FIELDS.has(field)
    ? [...STRING_OPS, ...NUMERIC_OPS]
    : STRING_OPS;
}

function newRow(): Predicate {
  return { field: "mc_number", op: "LIKE", value: "" };
}

export function AdvancedQueryBuilder({
  query,
  onApply,
  onClear,
}: {
  query: AdvancedQuery | null;
  onApply: (q: AdvancedQuery | null) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState<boolean>(!!query);
  const [draft, setDraft] = React.useState<AdvancedQuery>(query ?? EMPTY_QUERY);

  // Sync local draft only when the parent's query identity actually changes
  // (e.g. URL deserialization on mount, Clear All), never on every render —
  // otherwise typing in a row would clobber itself on the parent's next re-render.
  const prevQueryRef = React.useRef<AdvancedQuery | null>(query);
  React.useEffect(() => {
    if (prevQueryRef.current !== query) {
      setDraft(query ?? EMPTY_QUERY);
      prevQueryRef.current = query;
    }
  }, [query]);

  const triggerLabel = query
    ? `Advanced filters (${query.predicates.length})`
    : "Advanced filters";

  function updateRow(idx: number, patch: Partial<Predicate>) {
    setDraft((d) => {
      const next = d.predicates.slice();
      const current = next[idx];
      const merged: Predicate = { ...current, ...patch };
      if (patch.field && !opsForField(merged.field).includes(merged.op)) {
        merged.op = opsForField(merged.field)[0];
      }
      next[idx] = merged;
      return { ...d, predicates: next };
    });
  }

  function addRow() {
    setDraft((d) => ({ ...d, predicates: [...d.predicates, newRow()] }));
  }

  function removeRow(idx: number) {
    setDraft((d) => ({
      ...d,
      predicates: d.predicates.filter((_, i) => i !== idx),
    }));
  }

  function setMode(mode: AdvancedQueryMode) {
    setDraft((d) => ({ ...d, mode }));
  }

  // Strip half-filled rows before emitting upward so the URL serializer
  // never persists incomplete predicates that would 400 on the API round-trip.
  function apply() {
    const complete = draft.predicates.filter(isPredicateRowComplete);
    if (complete.length === 0) {
      onApply(null);
      return;
    }
    onApply({ mode: draft.mode, predicates: complete });
  }

  function clearLocal() {
    setDraft(EMPTY_QUERY);
    onClear();
  }

  const allRowsValid =
    draft.predicates.length > 0 &&
    draft.predicates.every(isPredicateRowComplete);

  return (
    <div className="rounded-md border bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 text-sm font-medium",
          "hover:bg-accent hover:text-accent-foreground rounded-md transition-colors",
        )}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 opacity-70" />
          ) : (
            <ChevronRight className="h-4 w-4 opacity-70" />
          )}
          {triggerLabel}
        </span>
        {query ? (
          <span className="text-xs text-muted-foreground">
            mode: {query.mode}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="space-y-3 border-t p-3">
          {draft.predicates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No predicates yet. Click &quot;Add filter&quot; to build a query.
            </p>
          ) : (
            <ul className="space-y-2">
              {draft.predicates.map((row, idx) => {
                const enumValues = ENUM_FIELD_VALUES[row.field];
                const ops = opsForField(row.field);
                const isNumericOp = NUMERIC_OPS.includes(row.op);
                return (
                  <li
                    key={idx}
                    className="flex flex-wrap items-end gap-2 rounded-md border bg-background/60 p-2"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Field
                      </span>
                      <Select
                        value={row.field}
                        onValueChange={(v) =>
                          updateRow(idx, { field: v as PredicateField })
                        }
                      >
                        <SelectTrigger className="h-9 w-[12rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PREDICATE_FIELDS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {FIELD_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Operator
                      </span>
                      <Select
                        value={row.op}
                        onValueChange={(v) =>
                          updateRow(idx, { op: v as PredicateOp })
                        }
                      >
                        <SelectTrigger className="h-9 w-[8rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ops.map((op) => (
                            <SelectItem key={op} value={op}>
                              {OP_LABELS[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-1 flex-col gap-1 min-w-[10rem]">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Value
                      </span>
                      {enumValues && !isNumericOp ? (
                        <Select
                          value={row.value}
                          onValueChange={(v) => updateRow(idx, { value: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select value..." />
                          </SelectTrigger>
                          <SelectContent>
                            {enumValues.map((v) => (
                              <SelectItem key={v} value={v}>
                                {titleCase(v)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={row.value}
                          onChange={(e) =>
                            updateRow(idx, { value: e.target.value })
                          }
                          placeholder={isNumericOp ? "Number..." : "Value..."}
                          inputMode={isNumericOp ? "decimal" : "text"}
                        />
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(idx)}
                      aria-label={`Remove predicate ${idx + 1}`}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add filter
            </Button>

            {draft.predicates.length > 1 ? (
              <fieldset className="flex items-center gap-3 text-xs">
                <legend className="sr-only">Combine predicates</legend>
                <span className="text-muted-foreground">Combine with:</span>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="advanced-mode"
                    value="AND"
                    checked={draft.mode === "AND"}
                    onChange={() => setMode("AND")}
                  />
                  AND
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="advanced-mode"
                    value="OR"
                    checked={draft.mode === "OR"}
                    onChange={() => setMode("OR")}
                  />
                  OR
                </label>
              </fieldset>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearLocal}
              >
                Clear advanced
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={!allRowsValid && draft.predicates.length > 0}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
