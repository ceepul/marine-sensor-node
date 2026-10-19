"use client";

import { ArrowDown, ArrowUp, Clock, Minus } from "lucide-react";
import { useNow } from "@/lib/client";
import { formatAgo, formatNumber, formatSigned } from "@/lib/format";
import { readingTime, type DeviceSummary, type Metrics } from "@/lib/types";
import { Card } from "../ui";

const STALE_AFTER_S = 5 * 60;

type Tile = {
  label: string;
  metric: keyof Metrics;
  unit: string;
  color: string;
  /** Smallest sparkline span, so sensor noise doesn't look like a trend. */
  minSpan: number;
  hint?: string;
};

const TILES: Tile[] = [
  { label: "Temperature", metric: "tempC", unit: "°C", color: "var(--series-temp)", minSpan: 1 },
  { label: "Relative humidity", metric: "rhPct", unit: "%", color: "var(--series-rh)", minSpan: 4 },
  {
    label: "Dew point",
    metric: "dewPointC",
    unit: "°C",
    color: "var(--series-dew)",
    minSpan: 1,
    hint: "Surfaces colder than this collect condensation",
  },
];

export function KpiRow({ summary, serverNow }: { summary: DeviceSummary; serverNow: number }) {
  const now = useNow(serverNow);
  const { latest, hourAgo, trend } = summary;
  const age = latest ? now - readingTime(latest) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {TILES.map((tile) => {
        const value = latest?.[tile.metric];
        const delta = latest && hourAgo ? latest[tile.metric] - hourAgo[tile.metric] : null;
        return (
          <Card key={tile.metric} className="flex flex-col px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-2">{tile.label}</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">
                  {value == null ? "—" : formatNumber(value)}
                  <span className="ml-1 text-base font-medium text-ink-3">{tile.unit}</span>
                </p>
              </div>
              <Sparkline points={trend.map((p) => ({ t: p.t, v: p[tile.metric] }))} color={tile.color} minSpan={tile.minSpan} />
            </div>
            {tile.hint && <p className="mt-1 text-xs text-ink-3">{tile.hint}</p>}
            <p className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-ink-3">
              {age != null && age > STALE_AFTER_S ? (
                <>
                  <Clock className="size-3.5" aria-hidden />
                  Last reading {formatAgo(age)}
                </>
              ) : delta == null ? (
                "No reading from an hour ago yet"
              ) : (
                <>
                  <DeltaIcon delta={delta} />
                  <span className="text-ink-2 tabular">
                    {formatSigned(delta)}
                    {tile.unit === "%" ? " pts" : " °C"}
                  </span>
                  vs 1 h ago
                </>
              )}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function DeltaIcon({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) return <Minus className="size-3.5" aria-hidden />;
  return delta > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />;
}

/** Last three hours in 15-minute steps: de-emphasised line, current value in the series colour. */
function Sparkline({ points, color, minSpan }: { points: { t: number; v: number }[]; color: string; minSpan: number }) {
  if (points.length < 2) return null;
  const [W, H, P] = [88, 36, 4];
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const values = points.map((p) => p.v);
  const mid = (Math.min(...values) + Math.max(...values)) / 2;
  const span = Math.max(Math.max(...values) - Math.min(...values), minSpan);
  const x = (t: number) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P);
  const y = (v: number) => H / 2 - ((v - mid) / span) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = points.at(-1)!;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1 shrink-0" aria-hidden>
      <path d={path} fill="none" stroke="var(--ink-3)" strokeOpacity={0.5} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.t)} cy={y(last.v)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
