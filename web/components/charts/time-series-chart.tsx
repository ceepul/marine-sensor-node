"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortDateTime } from "@/lib/format";
import { timeTicks, type SeriesPoint } from "@/lib/history";
import { niceScale } from "@/lib/scale";
import { axisTick, axisTimeLabel, ChartTooltipCard, formatTick } from "./chart-parts";

export type Series = {
  key: "temp" | "dew" | "rh";
  label: string;
  color: string;
  format: (v: number) => string;
};

const X_AXIS_HEIGHT = 28;
const TOP_MARGIN = 10;
const LABEL_GAP_PX = 14; // end labels closer than this would overlap

export function TimeSeriesChart({
  points,
  from,
  to,
  timeZone,
  series,
  height,
  minSpan,
  clamp,
}: {
  points: SeriesPoint[];
  from: number;
  to: number;
  timeZone: string;
  series: Series[];
  height: number;
  minSpan: number;
  clamp?: [number, number];
}) {
  const values = points.flatMap((p) => series.map((s) => p[s.key])).filter((v): v is number => v != null);
  const { domain, ticks } = niceScale(values, { minSpan, clamp, maxTicks: height > 200 ? 7 : 5 });

  // Direct labels at each line's end; dropped (legend and tooltip remain) if they would collide.
  const ends = series.flatMap((s) => {
    const last = points.findLast((p) => p[s.key] != null);
    return last ? [{ ...s, t: last.t, v: last[s.key]! }] : [];
  });
  const pxPerUnit = (height - X_AXIS_HEIGHT - TOP_MARGIN) / (domain[1] - domain[0]);
  const labelled = !(ends.length === 2 && Math.abs(ends[0].v - ends[1].v) * pxPerUnit < LABEL_GAP_PX);

  return (
    <LineChart
      responsive
      data={points}
      syncId="history"
      margin={{ top: TOP_MARGIN, right: 52, bottom: 0, left: 0 }}
      style={{ width: "100%", height }}
    >
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis
        dataKey="t"
        type="number"
        domain={[from, to]}
        ticks={timeTicks(from, to, timeZone)}
        tickFormatter={(t: number) => axisTimeLabel(t, timeZone)}
        tick={axisTick}
        tickLine={false}
        tickMargin={8}
        height={X_AXIS_HEIGHT}
        axisLine={{ stroke: "var(--axis)" }}
        allowDataOverflow
      />
      <YAxis
        domain={domain}
        ticks={ticks}
        tickFormatter={formatTick}
        tick={axisTick}
        tickLine={false}
        axisLine={false}
        width={40}
        allowDataOverflow
      />
      <Tooltip
        isAnimationActive={false}
        cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
        content={({ active, payload }) => {
          const point = active ? (payload?.[0]?.payload as SeriesPoint | undefined) : undefined;
          if (!point) return null;
          return (
            <ChartTooltipCard
              title={formatShortDateTime(point.t, timeZone)}
              rows={series.map((s) => ({
                label: s.label,
                color: s.color,
                value: point[s.key] == null ? null : s.format(point[s.key]!),
              }))}
            />
          );
        }}
      />
      {series.map((s) => (
        <Line
          key={s.key}
          dataKey={s.key}
          name={s.label}
          type="monotone"
          stroke={s.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      ))}
      {ends.map((e) => (
        <ReferenceDot
          key={e.key}
          x={e.t}
          y={e.v}
          r={4}
          fill={e.color}
          stroke="var(--surface)"
          strokeWidth={2}
          label={labelled ? { value: e.format(e.v), position: "right", offset: 8, fill: "var(--ink-2)", fontSize: 11 } : undefined}
        />
      ))}
    </LineChart>
  );
}
