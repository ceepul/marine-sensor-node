"use client";

import { MapPin } from "lucide-react";
import { useSummary } from "@/lib/client";
import type { DeviceHistory, DeviceListItem, DeviceSummary } from "@/lib/types";
import { DevicePicker } from "../device-picker";
import { PageHeader } from "../ui";
import { HistoryPanel } from "./history-panel";
import { KpiRow } from "./kpi-row";
import { LiveLog } from "./live-log";

export function DashboardLive({
  devices,
  initialSummary,
  initialHistory,
}: {
  devices: DeviceListItem[];
  initialSummary: DeviceSummary;
  initialHistory: DeviceHistory;
}) {
  const deviceId = initialSummary.deviceId;
  const serverNow = initialSummary.now; // what SSR rendered against; see useNow
  const { data: summary = initialSummary } = useSummary(deviceId, initialSummary);
  const timeZone = summary.site.timeZone;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={<SiteLine name={summary.site.name} deviceId={deviceId} />}
        actions={<DevicePicker devices={devices} value={deviceId} />}
      />

      <KpiRow summary={summary} serverNow={serverNow} />

      <LiveLog log={summary.log} deviceId={deviceId} timeZone={timeZone} serverNow={serverNow} />

      <HistoryPanel deviceId={deviceId} initial={initialHistory} timeZone={timeZone} />
    </div>
  );
}

export function SiteLine({ name, deviceId }: { name: string; deviceId: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="size-3.5 text-ink-3" aria-hidden />
        {name}
      </span>
      <span className="text-ink-3" aria-hidden>
        ·
      </span>
      <span className="font-mono text-xs text-ink-2">{deviceId}</span>
    </span>
  );
}
