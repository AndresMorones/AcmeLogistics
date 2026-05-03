"use client";

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReactiveWidget } from "@/components/reactive-widget";
import type {
  CallRecord,
  EconomicsMetrics,
  FunnelMetrics,
  OperationalMetrics,
  TelemetryAggregate,
} from "@/types/api-types";

type TabKey = "economics" | "operational" | "quality" | "telemetry";

type Props = {
  funnel: FunnelMetrics;
  economics: EconomicsMetrics;
  operational: OperationalMetrics;
  calls: CallRecord[];
  dailySentiment: import("@/lib/daily-buckets").DailySentimentBucket[];
  telemetry: TelemetryAggregate | null;
  economicsContent: React.ReactNode;
  operationalContent: React.ReactNode;
  qualityContent: React.ReactNode;
  telemetryContent: React.ReactNode;
};

function TabBody({
  widget,
  content,
}: {
  widget: React.ReactNode;
  content: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div className="md:col-span-1">{widget}</div>
      <div className="space-y-4 md:col-span-3 min-w-0">{content}</div>
    </div>
  );
}

export function MonitorTabs(props: Props) {
  const [tab, setTab] = React.useState<TabKey>("economics");

  // Single widget instance reads `tab` and swaps its own visualization — keeps chart state (zoom, hover) stable as the user flips tab strips.
  const widget = (
    <ReactiveWidget
      tab={tab}
      funnel={props.funnel}
      economics={props.economics}
      operational={props.operational}
      calls={props.calls}
      dailySentiment={props.dailySentiment}
      telemetry={props.telemetry}
    />
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabKey)}
      className="space-y-4"
    >
      <TabsList className="flex h-10 w-full justify-end gap-1 rounded-md bg-muted p-1">
        <TabsTrigger value="economics">Economics</TabsTrigger>
        <TabsTrigger value="operational">Operational</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
        <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
      </TabsList>

      <TabsContent value="economics" className="mt-0">
        <TabBody widget={widget} content={props.economicsContent} />
      </TabsContent>
      <TabsContent value="operational" className="mt-0">
        <TabBody widget={widget} content={props.operationalContent} />
      </TabsContent>
      <TabsContent value="quality" className="mt-0">
        <TabBody widget={widget} content={props.qualityContent} />
      </TabsContent>
      <TabsContent value="telemetry" className="mt-0">
        <TabBody widget={widget} content={props.telemetryContent} />
      </TabsContent>
    </Tabs>
  );
}
