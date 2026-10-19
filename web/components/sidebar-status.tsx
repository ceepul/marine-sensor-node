"use client";

import { X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiKeys, fetchJson, useNow } from "@/lib/client";
import { NODE_LABELS, SENSOR_LABELS, type Tone } from "@/lib/labels";
import { nodeStatus, sensorStatus } from "@/lib/status";
import { readingTime, type DeviceListItem, type DeviceSummary } from "@/lib/types";
import { NodeCard, SensorCard } from "./dashboard/status-cards";
import { cn } from "./ui";

/** Pi and sensor status in the sidebar footer; clicking opens the details. */
export function SidebarStatus() {
  const requested = useSearchParams().get("device");
  const { data: list } = useSWR<{ devices: DeviceListItem[] }>("/api/devices", fetchJson, { refreshInterval: 60_000 });
  const deviceId = list?.devices.find((d) => d.id === requested)?.id ?? list?.devices[0]?.id;
  // Same key the dashboard polls, so the two share one request.
  const { data: summary } = useSWR<DeviceSummary>(deviceId ? apiKeys.summary(deviceId) : null, fetchJson, {
    refreshInterval: 10_000,
  });

  if (list && list.devices.length === 0) {
    return <p className="hidden px-2.5 py-2 text-sm text-ink-3 md:block">No node connected yet</p>;
  }
  if (!summary) return <SidebarStatusPlaceholder />;
  return <StatusRows summary={summary} />;
}

export function SidebarStatusPlaceholder() {
  return (
    <div className="space-y-0.5">
      <Row label="Raspberry Pi" status="…" tone="neutral" />
      <Row label="Sensor" status="…" tone="neutral" />
    </div>
  );
}

function StatusRows({ summary }: { summary: DeviceSummary }) {
  const now = useNow(summary.now);
  const node = nodeStatus(summary.lastSeenAt, now);
  const { status: sensor } = sensorStatus({
    node,
    lastStateEvent: summary.lastStateEvent,
    lastLoggerStart: summary.lastLoggerStart,
    lastReadingAt: summary.latest ? readingTime(summary.latest) : null,
    now,
  });

  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <>
      <div className="space-y-0.5">
        <Row label="Raspberry Pi" {...asRow(NODE_LABELS[node])} pulse={node === "online"} onClick={() => setOpen(true)} />
        <Row label="Sensor" {...asRow(SENSOR_LABELS[sensor])} onClick={() => setOpen(true)} />
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)} // click on the backdrop
        aria-labelledby="status-title"
        className="m-auto w-[min(760px,calc(100vw-2rem))] rounded-2xl border border-border bg-page p-0 text-ink shadow-2xl backdrop:bg-black/50"
      >
        {open && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="status-title" className="text-base font-semibold">
                System status <span className="ml-1 font-mono text-xs font-normal text-ink-3">{summary.deviceId}</span>
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <NodeCard summary={summary} serverNow={summary.now} />
              <SensorCard summary={summary} serverNow={summary.now} />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

const asRow = ({ label, tone }: { label: string; tone: Tone }) => ({ status: label, tone });

function Row({
  label,
  status,
  tone,
  pulse,
  onClick,
}: {
  label: string;
  status: string;
  tone: Tone;
  pulse?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={`${label}: ${status}`}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-sm enabled:hover:bg-surface-2 md:justify-start"
    >
      <span className={cn(`tone-${tone} size-2 shrink-0 rounded-full bg-(--tone)`, pulse && "live-dot")} aria-hidden />
      <span className="sr-only text-ink-2 md:not-sr-only md:flex-1 md:text-left">{label}</span>
      <span className="sr-only font-medium text-ink md:not-sr-only">{status}</span>
    </button>
  );
}
