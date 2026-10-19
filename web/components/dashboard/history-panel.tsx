"use client";

import { ChartLine, Table2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { apiKeys, fetchJson } from "@/lib/client";
import { formatDuration, formatNumber, formatRh, formatShortDateTime, formatTemp, zoneLabel } from "@/lib/format";
import { RANGE_KEYS, RANGES, type RangeKey } from "@/lib/history";
import { READING_INTERVAL_S } from "@/lib/status";
import type { DeviceHistory, RangeStats } from "@/lib/types";
import { Legend } from "../charts/chart-parts";
import { TimeSeriesChart, type Series } from "../charts/time-series-chart";
import { Card, CardHeader, cn, Segmented } from "../ui";

const TEMP: Series = { key: "temp", label: "Temperature", color: "var(--series-temp)", format: formatTemp };
const DEW: Series = { key: "dew", label: "Dew point", color: "var(--series-dew)", format: formatTemp };
const RH: Series = { key: "rh", label: "Humidity", color: "var(--series-rh)", format: formatRh };

export function HistoryPanel({
  deviceId,
  initial,
  timeZone,
  className,
}: {
  deviceId: string;
  initial: DeviceHistory;
  timeZone: string;
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [view, setView] = useState<"chart" | "table">("chart");
  const { data = initial } = useSWR<DeviceHistory>(apiKeys.history(deviceId, range), fetchJson, {
    fallbackData: range === initial.range ? initial : undefined,
    keepPreviousData: true,
    refreshInterval: RANGES[range].seconds <= 6 * 3600 ? 30_000 : 120_000,
  });
  const loading = data.range !== range; // still showing the previous range while the new one loads
  const empty = data.points.length === 0;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="History"
        description={`${data.bucket <= READING_INTERVAL_S ? "Every reading" : `${formatDuration(data.bucket)} averages`} · ${zoneLabel(timeZone)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Time range"
              value={range}
              onChange={setRange}
              options={RANGE_KEYS.map((key) => ({ value: key, label: RANGES[key].label }))}
            />
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: <ChartLine className="size-3.5" aria-label="Chart" />, title: "Chart" },
                { value: "table", label: <Table2 className="size-3.5" aria-label="Table" />, title: "Table" },
              ]}
            />
          </div>
        }
      />

      <div className={cn("flex-1 px-5 pt-2 pb-4 transition-opacity", loading && "opacity-50")} aria-busy={loading}>
        {empty ? (
          <div className="grid h-100 place-items-center text-sm text-ink-3">
            No readings in the last {RANGES[range].label.toLowerCase()}.
          </div>
        ) : view === "chart" ? (
          <div className="space-y-5">
            <figure>
              <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium text-ink">Temperature & dew point</span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Legend items={[TEMP, DEW]} />
                  {data.stats && <Stats stats={data.stats.temp} unit="°C" />}
                </span>
              </figcaption>
              <TimeSeriesChart
                points={data.points}
                from={data.from}
                to={data.to}
                timeZone={timeZone}
                series={[TEMP, DEW]}
                height={236}
                minSpan={4}
              />
            </figure>
            <figure>
              <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium text-ink">Relative humidity</span>
                {data.stats && <Stats stats={data.stats.rh} unit="%" />}
              </figcaption>
              <TimeSeriesChart
                points={data.points}
                from={data.from}
                to={data.to}
                timeZone={timeZone}
                series={[RH]}
                height={168}
                minSpan={10}
                clamp={[0, 100]}
              />
            </figure>
          </div>
        ) : (
          <HistoryTable data={data} timeZone={timeZone} />
        )}
        {data.unsynced > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            {data.unsynced} reading{data.unsynced === 1 ? "" : "s"} taken before the node&apos;s clock synced{" "}
            {data.unsynced === 1 ? "is" : "are"} in the log but left off the chart, since {data.unsynced === 1 ? "its" : "their"} times
            can&apos;t be trusted.
          </p>
        )}
      </div>
    </Card>
  );
}

function Stats({ stats, unit }: { stats: RangeStats; unit: string }) {
  return (
    <span className="text-xs text-ink-3 tabular">
      Low <span className="text-ink-2">{formatNumber(stats.min)}</span> · Avg{" "}
      <span className="text-ink-2">{formatNumber(stats.avg)}</span> · High{" "}
      <span className="text-ink-2">{formatNumber(stats.max)}</span> {unit}
    </span>
  );
}

function HistoryTable({ data, timeZone }: { data: DeviceHistory; timeZone: string }) {
  const rows = data.points.filter((p) => p.temp != null).reverse();
  return (
    <div className="max-h-105 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-sm tabular">
        <caption className="sr-only">Averaged readings, newest first</caption>
        <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-right font-medium">Temperature</th>
            <th className="px-3 py-2 text-right font-medium">Dew point</th>
            <th className="px-3 py-2 text-right font-medium">Humidity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.t}>
              <td className="px-3 py-1.5 text-ink-2">{formatShortDateTime(p.t, timeZone)}</td>
              <td className="px-3 py-1.5 text-right text-ink">{formatTemp(p.temp!)}</td>
              <td className="px-3 py-1.5 text-right text-ink">{formatTemp(p.dew!)}</td>
              <td className="px-3 py-1.5 text-right text-ink">{formatRh(p.rh!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
