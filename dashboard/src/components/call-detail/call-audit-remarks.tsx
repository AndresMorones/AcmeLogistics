import { ClipboardCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Remarks are produced by an automated post-call review pass; absence means
// "no flags raised", not "review skipped" — surfaced as a benign empty state.
export function CallAuditRemarks({
  remarks,
}: {
  remarks: string | null | undefined;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Audit remarks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {remarks ? (
          <div className="rounded-md border-l-4 border-l-primary/60 bg-muted/40 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {remarks}
            </p>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Auto-generated post-call review
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No quality flags on this call.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
