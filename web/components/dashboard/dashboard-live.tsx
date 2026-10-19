"use client";

import { MapPin } from "lucide-react";
import useSWR from "swr";
import { apiKeys, fetchJson } from "@/lib/client";
import type { CondensationState, DeviceHistory, DeviceListItem, DeviceSummary } from "@/lib/types";
import { RiskBanner } from "../condensation/risk-banner";
import { DevicePicker } from "../device-picker";
import { PageHeader } from "../ui";
import { HistoryPanel } from "./history-panel";
import { KpiRow } from "./kpi-row";
import { LiveLog } from "./live-log";

const SUMMARY_POLL_MS = 10_000;
const CONDENSATION_POLL_MS = 120_000; // the forecast itself only refreshes every 30 min

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
  const { data: summary = initialSummary } = useSWR<DeviceSummary>(apiKeys.summary(deviceId), fetchJson, {
    fallbackData: initialSummary,
    refreshInterval: SUMMARY_POLL_MS,
  });
  const { data: condensation } = useSWR<CondensationState>(apiKeys.condensation(deviceId), fetchJson, {
    refreshInterval: CONDENSATION_POLL_MS,
  });
  const timeZone = summary.site.timeZone;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={<SiteLine name={summary.site.name} deviceId={deviceId} />}
        actions={<DevicePicker devices={devices} value={deviceId} />}
      />

      {condensation && <RiskBanner state={condensation} />}

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
