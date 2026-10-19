"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { CAUTION_MARGIN_C } from "@/lib/condensation";
import { formatShortDateTime, formatSigned, formatTemp } from "@/lib/format";
import { timeTicks } from "@/lib/history";
import { niceScale } from "@/lib/scale";
import { axisTick, axisTimeLabel, ChartTooltipCard, formatTick } from "./chart-parts";

export type ForecastPoint = { t: number; temp: number; cloudCover: number | null; precipProbability: number | null };

/** Outside air over the next 48 h against the container's dew point, with the risk zones shaded. */
export function ForecastChart({ points, dewPointC, timeZone }: { points: ForecastPoint[]; dewPointC: number; timeZone: string }) {
  const caution = dewPointC + CAUTION_MARGIN_C;
  const { domain, ticks } = niceScale([...points.map((p) => p.temp), dewPointC, caution], { minSpan: 6 });
  const from = points[0].t;
  const to = points.at(-1)!.t;

  return (
    <LineChart responsive data={points} margin={{ top: 10, right: 16, bottom: 0, left: 0 }} style={{ width: "100%", height: 300 }}>
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <ReferenceArea
        y1={domain[0]}
        y2={dewPointC}
        fill="var(--critical)"
        fillOpacity={0.1}
        label={{ value: "Condensation", position: "insideBottomLeft", fill: "var(--ink-2)", fontSize: 11, offset: 8 }}
      />
      <ReferenceArea
        y1={dewPointC}
        y2={caution}
        fill="var(--warning)"
        fillOpacity={0.14}
        label={{ value: "Caution", position: "insideLeft", fill: "var(--ink-2)", fontSize: 11, offset: 8 }}
      />
      <XAxis
        dataKey="t"
        type="number"
        domain={[from, to]}
        ticks={timeTicks(from, to, timeZone)}
        tickFormatter={(t: number) => axisTimeLabel(t, timeZone)}
        tick={axisTick}
        tickLine={false}
        tickMargin={8}
        axisLine={{ stroke: "var(--axis)" }}
      />
      <YAxis domain={domain} ticks={ticks} tickFormatter={formatTick} tick={axisTick} tickLine={false} axisLine={false} width={40} />
      <ReferenceLine
        y={dewPointC}
        stroke="var(--series-dew)"
        strokeWidth={2}
        strokeDasharray="6 4"
        label={{ value: `Dew point ${formatTemp(dewPointC)}`, position: "insideBottomRight", fill: "var(--ink-2)", fontSize: 11, offset: 6 }}
      />
      <Tooltip
        isAnimationActive={false}
        cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
        content={({ active, payload }) => {
          const p = active ? (payload?.[0]?.payload as ForecastPoint | undefined) : undefined;
          if (!p) return null;
          const extras = [
            p.cloudCover != null && `${Math.round(p.cloudCover)}% cloud`,
            p.precipProbability != null && `${Math.round(p.precipProbability)}% chance of rain`,
          ].filter(Boolean);
          return (
            <ChartTooltipCard
              title={formatShortDateTime(p.t, timeZone)}
              rows={[
                { label: "Outside air", color: "var(--series-temp)", value: formatTemp(p.temp) },
                { label: "vs dew point", color: "var(--series-dew)", value: `${formatSigned(p.temp - dewPointC)} °C`, dashed: true },
              ]}
              note={extras.join(" · ") || undefined}
            />
          );
        }}
      />
      <Line
        dataKey="temp"
        name="Outside air"
        type="monotone"
        stroke="var(--series-temp)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        dot={false}
        activeDot={{ r: 4, fill: "var(--series-temp)", stroke: "var(--surface)", strokeWidth: 2 }}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
