"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const RANGES = [
  { v: "1h", label: "1H" },
  { v: "3h", label: "3H" },
  { v: "12h", label: "12H" },
  { v: "1d", label: "1D" },
  { v: "3d", label: "3D" },
  { v: "1w", label: "1W" },
];

// Range-only by design: per-component refresh and percentile pickers were removed because
// the latency chart now plots all 4 percentiles together and live polling is owned at the
// page level — adding a refresh button here would double-poll the upstream API.
export function TelemetryControls() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const range = sp.get("range") ?? "12h";

  const setRange = (v: string) => {
    const params = new URLSearchParams(sp.toString());
    if (!v) params.delete("range");
    else params.set("range", v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="uppercase tracking-wider">Range</span>
        <ToggleGroup
          type="single"
          value={[range]}
          onChange={(v) => setRange(v[0] ?? "1d")}
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.v} value={r.v}>
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
