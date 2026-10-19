"use client";

import {
  ChartLine,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { apiKeys, fetchJson } from "@/lib/client";
import { CAUTION_MARGIN_C, describeRisk, FORECAST_WINDOW_H } from "@/lib/condensation";
import { formatAgo, formatDayTime, formatNumber, formatRh, formatShortDateTime, formatSigned, formatTemp, zoneLabel } from "@/lib/format";
import { RISK_LABELS, type Tone } from "@/lib/labels";
import { describeWeather, type WeatherIcon } from "@/lib/open-meteo";
import { readingTime, type CondensationState, type DeviceListItem } from "@/lib/types";
import { Legend } from "../charts/chart-parts";
import { ForecastChart, type ForecastPoint } from "../charts/forecast-chart";
import { SiteLine } from "../dashboard/dashboard-live";
import { DevicePicker } from "../device-picker";
import { Card, CardHeader, Notice, PageHeader, Segmented, StatusPill, TONE_ICONS } from "../ui";

const POLL_MS = 60_000;

const WEATHER_ICONS: Record<WeatherIcon, [day: LucideIcon, night: LucideIcon]> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  snow: [CloudSnow, CloudSnow],
  storm: [CloudLightning, CloudLightning],
};

export function CondensationLive({ devices, initial }: { devices: DeviceListItem[]; initial: CondensationState }) {
  const { data: state = initial } = useSWR<CondensationState>(apiKeys.condensation(initial.deviceId), fetchJson, {
    fallbackData: initial,
    refreshInterval: POLL_MS,
  });
  const { site, reading, weather, assessment: a } = state;
  const current = weather?.current ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Condensation risk"
        description={<SiteLine name={site.name} deviceId={state.deviceId} />}
        actions={<DevicePicker devices={devices} value={state.deviceId} />}
      />

      <RiskHero state={state} />

      {weather?.stale && (
        <Notice tone="warning">
          The weather service isn&apos;t responding, so this uses the forecast from {formatAgo(state.now - weather.fetchedAt)}.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Container dew point" value={reading?.dewPointC} unit="°C">
          {reading ? `From ${formatTemp(reading.tempC)} at ${formatRh(reading.rhPct)}, ${formatAgo(state.now - readingTime(reading))}` : "No reading yet"}
        </Tile>
        <Tile label="Outside now" value={current?.tempC} unit="°C">
          {current ? <CurrentWeather current={current} /> : "No current conditions"}
        </Tile>
        <Tile label={`Forecast low, next ${FORECAST_WINDOW_H} h`} value={a?.low.tempC} unit="°C">
          {a ? formatDayTime(a.low.t, site.timeZone, state.now) : "—"}
        </Tile>
        <Tile label="Closest margin" value={a?.marginC} unit="°C" signed>
          {a ? (a.marginC > 0 ? "Above the dew point at the coldest moment" : "At or below the dew point: expect condensation") : "—"}
        </Tile>
      </div>

      {weather && reading && <ForecastCard state={state} />}

      <p className="text-xs text-ink-3">
        Forecast for {site.name} ({formatNumber(site.latitude, 3)}, {formatNumber(site.longitude, 3)})
        {weather && `, updated ${formatAgo(state.now - weather.fetchedAt)}`}. Weather data by{" "}
        <a href="https://open-meteo.com/" className="underline underline-offset-2 hover:text-ink-2">
          Open-Meteo.com
        </a>{" "}
        (CC BY 4.0).
      </p>
    </div>
  );
}

function RiskHero({ state }: { state: CondensationState }) {
  const a = state.assessment;
  if (!a) return <Notice tone="neutral" title="Can't assess the risk right now">{unavailableMessage(state)}</Notice>;

  const { label, tone } = RISK_LABELS[a.level];
  const { title, detail } = describeRisk(a, state.site.timeZone, state.now);
  const Icon = TONE_ICONS[tone];
  return (
    <section
      role="status"
      className={`tone-${tone} flex items-start gap-4 rounded-xl border border-[color-mix(in_srgb,var(--tone)_40%,transparent)] bg-(--tone-wash) p-5 sm:p-6`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface">
        <Icon className="size-6 text-(--tone-ink)" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-ink">
          <span className="sr-only">{label}: </span>
          {title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">{detail}</p>
      </div>
    </section>
  );
}

function unavailableMessage(state: CondensationState): string {
  switch (state.unavailable) {
    case "no_reading":
      return "Waiting for the first reading from the sensor: the container's dew point comes from it.";
    case "stale_reading":
      return `The last reading is ${formatAgo(state.now - readingTime(state.reading!))} old, too old to know how much moisture is in the container now.`;
    case "no_weather":
      return "The weather forecast is unavailable right now. It's retried automatically.";
    default:
      return `The forecast has no data for the next ${FORECAST_WINDOW_H} hours.`;
  }
}

function Tile({ label, value, unit, signed, children }: { label: string; value?: number; unit: string; signed?: boolean; children: ReactNode }) {
  return (
    <Card className="flex flex-col px-5 py-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">
        {value == null ? "—" : signed ? formatSigned(value) : formatNumber(value)}
        <span className="ml-1 text-base font-medium text-ink-3">{unit}</span>
      </p>
      <div className="mt-auto pt-3 text-xs text-ink-3">{children}</div>
    </Card>
  );
}

function CurrentWeather({ current }: { current: NonNullable<NonNullable<CondensationState["weather"]>["current"]> }) {
  const { label, icon } = describeWeather(current.weatherCode);
  const Icon = WEATHER_ICONS[icon][current.isDay ? 0 : 1];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label} · {Math.round(current.rhPct)}% RH · {Math.round(current.windKph)} km/h wind
    </span>
  );
}

function ForecastCard({ state }: { state: CondensationState }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const dew = state.reading!.dewPointC;
  const { current, hourly } = state.weather!;
  const end = state.now + FORECAST_WINDOW_H * 3600;
  // The same points the assessment uses: current conditions, then the hourly forecast.
  const points: ForecastPoint[] = [
    ...(current && state.now - current.t < 3 * 3600
      ? [{ t: current.t, temp: current.tempC, cloudCover: current.cloudCover, precipProbability: null }]
      : []),
    ...hourly
      .filter((h) => h.t > state.now && h.t <= end)
      .map((h) => ({ t: h.t, temp: h.tempC, cloudCover: h.cloudCover, precipProbability: h.precipProbability })),
  ];
  if (points.length < 2) return null;

  return (
    <Card>
      <CardHeader
        title="Outside air vs. container dew point"
        description={`Next ${FORECAST_WINDOW_H} hours · ${zoneLabel(state.site.timeZone)}`}
        actions={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: <ChartLine className="size-3.5" aria-label="Chart" />, title: "Chart" },
              { value: "table", label: <Table2 className="size-3.5" aria-label="Table" />, title: "Table" },
            ]}
          />
        }
      />
      <div className="px-5 pt-3 pb-5">
        {view === "chart" ? (
          <figure>
            <figcaption className="mb-3">
              <Legend
                items={[
                  { label: "Outside air (forecast)", color: "var(--series-temp)" },
                  { label: "Container dew point", color: "var(--series-dew)", dashed: true },
                ]}
              />
            </figcaption>
            <ForecastChart points={points} dewPointC={dew} timeZone={state.site.timeZone} />
          </figure>
        ) : (
          <ForecastTable points={points} dew={dew} timeZone={state.site.timeZone} />
        )}
      </div>
    </Card>
  );
}

function ForecastTable({ points, dew, timeZone }: { points: ForecastPoint[]; dew: number; timeZone: string }) {
  return (
    <div className="max-h-105 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-sm tabular">
        <caption className="sr-only">Hourly forecast and condensation risk</caption>
        <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-right font-medium">Outside air</th>
            <th className="px-3 py-2 text-right font-medium">vs dew point</th>
            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Cloud</th>
            <th className="px-3 py-2 text-right font-medium">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {points.map((p) => {
            const margin = p.temp - dew;
            const level = margin <= 0 ? "high" : margin <= CAUTION_MARGIN_C ? "elevated" : "low";
            const { label, tone } = RISK_LABELS[level];
            return (
              <tr key={p.t}>
                <td className="px-3 py-1.5 text-ink-2">{formatShortDateTime(p.t, timeZone)}</td>
                <td className="px-3 py-1.5 text-right text-ink">{formatTemp(p.temp)}</td>
                <td className="px-3 py-1.5 text-right text-ink">{formatSigned(margin)}&nbsp;°C</td>
                <td className="hidden px-3 py-1.5 text-right text-ink-2 sm:table-cell">
                  {p.cloudCover == null ? "—" : `${Math.round(p.cloudCover)}%`}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <StatusPill tone={tone as Tone} label={label.replace(" risk", "")} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
