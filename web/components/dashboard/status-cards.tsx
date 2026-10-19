"use client";

import { Cpu, Thermometer, TriangleAlert } from "lucide-react";
import { useNow } from "@/lib/client";
import { formatAgo, formatDateTime, formatDayTime, formatDuration } from "@/lib/format";
import { NODE_LABELS, SENSOR_LABELS, type Tone } from "@/lib/labels";
import { nodeStatus, READING_INTERVAL_S, sensorStatus } from "@/lib/status";
import { readingTime, type DeviceSummary } from "@/lib/types";
import { Card, CardHeader, Facts, Notice, StatusPill } from "../ui";

type Props = { summary: DeviceSummary; serverNow: number };

export function NodeCard({ summary, serverNow }: Props) {
  const now = useNow(serverNow);
  const status = nodeStatus(summary.lastSeenAt, now);
  const { label, tone } = NODE_LABELS[status];
  const quietFor = formatDuration(now - summary.lastSeenAt);
  const clockOk = summary.latest?.clockOk;

  return (
    <Card>
      <CardHeader
        icon={Cpu}
        title="Raspberry Pi"
        description={`Sensor node · uploads every ${READING_INTERVAL_S} s`}
        actions={<StatusPill tone={tone} label={label} />}
      />
      <div className="space-y-4 px-5 pt-4 pb-5">
        {status === "offline" && (
          <Notice tone="critical" title={`No contact for ${quietFor}`}>
            Check the Pi&apos;s power and network. If only the network is down, readings are buffered on the Pi and
            upload when it reconnects.
          </Notice>
        )}
        <Facts
          rows={[
            ["Last contact", formatAgo(now - summary.lastSeenAt)],
            [
              "Clock",
              clockOk == null ? (
                "—"
              ) : clockOk ? (
                "NTP synced"
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5 text-(--warning-ink)" aria-hidden />
                  Not synced
                </span>
              ),
            ],
            ["Logger restarts", summary.restarts24h === 0 ? "None in 24 h" : `${summary.restarts24h} in 24 h`],
            ["First seen", formatDateTime(summary.firstSeenAt, summary.site.timeZone)],
          ]}
        />
      </div>
    </Card>
  );
}

export function SensorCard({ summary, serverNow }: Props) {
  const now = useNow(serverNow);
  const lastReadingAt = summary.latest ? readingTime(summary.latest) : null;
  const { status, since } = sensorStatus({
    node: nodeStatus(summary.lastSeenAt, now),
    lastStateEvent: summary.lastStateEvent,
    lastLoggerStart: summary.lastLoggerStart,
    lastReadingAt,
    now,
  });
  const { label, tone } = SENSOR_LABELS[status];
  // A node that connected less than an hour ago can't have a full hour of readings yet.
  const expected = Math.max(1, Math.floor(Math.min(3600, now - summary.firstSeenAt) / READING_INTERVAL_S));

  return (
    <Card>
      <CardHeader
        icon={Thermometer}
        title="Sensor"
        description="Tzone temperature & humidity · Modbus RS-485"
        actions={<StatusPill tone={tone} label={label} />}
      />
      <div className="space-y-4 px-5 pt-4 pb-5">
        {status === "port_missing" && (
          <Notice tone="critical" title="RS-485 adapter not detected">
            The logger can&apos;t open /dev/rs485. Check the USB-RS485 converter and its cable.
          </Notice>
        )}
        {status === "sensor_silent" && (
          <Notice tone="critical" title="Sensor not answering">
            The adapter is present but the sensor doesn&apos;t respond. Check the sensor&apos;s power supply and the A/B
            wiring.
          </Notice>
        )}
        {status === "stalled" && since != null && (
          <Notice tone="warning">
            No readings for {formatDuration(now - since)} although the node is online. The logger service may have
            stopped.
          </Notice>
        )}
        {status === "starting" && <Notice tone="neutral">The logger just restarted; the first reading follows within {READING_INTERVAL_S} s.</Notice>}
        {status === "unknown" && (
          <Notice tone="neutral">The sensor can&apos;t be checked while the node is unreachable.</Notice>
        )}
        <Facts
          rows={[
            ["Last reading", lastReadingAt == null ? "—" : formatAgo(now - lastReadingAt)],
            ["Readings, last hour", <Completeness key="c" count={summary.readingsLastHour} expected={expected} />],
            ["In this state since", since == null ? "—" : formatDayTime(since, summary.site.timeZone, now)],
          ]}
        />
      </div>
    </Card>
  );
}

function Completeness({ count, expected }: { count: number; expected: number }) {
  const received = Math.min(count, expected);
  const ratio = received / expected;
  const tone: Tone = ratio >= 0.95 ? "good" : ratio >= 0.75 ? "warning" : "critical";
  return (
    <span className="inline-flex items-center justify-end gap-2.5">
      <span className={`tone-${tone} relative h-1.5 w-16 overflow-hidden rounded-full bg-(--tone-wash)`} aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-(--tone)" style={{ width: `${ratio * 100}%` }} />
      </span>
      {received} of {expected}
    </span>
  );
}
