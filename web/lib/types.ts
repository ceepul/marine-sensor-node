// Response shapes shared by the API routes, the server-rendered pages and the
// client components that poll them.

import type { Site } from "@/config/sites";
import type { Assessment } from "./condensation";
import type { RangeKey, SeriesPoint } from "./history";
import type { NodeStatus, SensorStatus } from "./status";

export type { Site };

export type Metrics = { tempC: number; rhPct: number; dewPointC: number };

export type Reading = Metrics & {
  ts: number; // node clock (UTC seconds)
  receivedAt: number; // server clock
  clockOk: boolean;
};

/** When a reading was taken. Falls back to arrival time if the node's clock wasn't synced. */
export const readingTime = (r: Pick<Reading, "ts" | "receivedAt" | "clockOk">) => (r.clockOk ? r.ts : r.receivedAt);

/** `sourceId` is the row id on the node (null for events the server records itself). */
export type LogEntry =
  | (Reading & { type: "reading"; key: string; sourceId: number })
  | { type: "event"; key: string; sourceId: number | null; ts: number; receivedAt: number; kind: string; detail: string | null };

export type DeviceListItem = { id: string; firstSeenAt: number; lastSeenAt: number };

/** The highest reading and event row ids a client's log has seen. */
export type LogCursor = { reading: number; event: number };

/** Cheap to read: a handful of rows, so it's fetched on every poll. */
export type SummaryLive = {
  now: number;
  deviceId: string;
  site: Site;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Latest logger state change: "ok", "port_missing" or "sensor_silent". */
  lastStateEvent: { kind: string; ts: number } | null;
  lastLoggerStart: number | null;
  latest: Reading | null;
  /** Newest readings and events, merged, newest first. */
  log: LogEntry[];
  cursor: LogCursor;
  /** Status as of `now`. The dashboard re-derives it as time passes between polls. */
  status: { node: NodeStatus; sensor: SensorStatus; sensorSince: number | null };
};

/** Scans hours of readings and changes slowly, so polls refresh it only every STATS_EVERY_S. */
export type SummaryStats = {
  /** Server time the stats were computed. */
  statsAt: number;
  restarts24h: number;
  /** Readings about an hour before `latest`, for the "vs 1 h ago" deltas. */
  hourAgo: Metrics | null;
  /** 15-minute averages over the last 3 hours, for sparklines. */
  trend: (Metrics & { t: number })[];
  readingsLastHour: number;
};

export type DeviceSummary = SummaryLive & SummaryStats;

/** What the summary API returns: with `after`, only newer log entries; stats only when asked for. */
export type SummaryUpdate = SummaryLive & { stats: SummaryStats | null };

export type RangeStats = { min: number; max: number; avg: number };

export type DeviceHistory = {
  range: RangeKey;
  from: number;
  to: number;
  bucket: number;
  points: SeriesPoint[];
  stats: { temp: RangeStats; rh: RangeStats; dew: RangeStats } | null;
  /** Readings in range left off the chart because the node's clock wasn't synced. */
  unsynced: number;
};

export type WeatherHour = {
  t: number;
  tempC: number;
  rhPct: number | null;
  dewPointC: number | null;
  cloudCover: number | null;
  precipProbability: number | null;
  weatherCode: number | null;
};

export type WeatherNow = {
  t: number;
  tempC: number;
  rhPct: number;
  dewPointC: number;
  weatherCode: number;
  cloudCover: number;
  windKph: number;
  isDay: boolean;
};

export type WeatherSnapshot = {
  fetchedAt: number;
  latitude: number;
  longitude: number;
  current: WeatherNow | null;
  hourly: WeatherHour[];
};

export type CondensationUnavailable = "no_reading" | "stale_reading" | "no_weather" | "no_forecast";

export type CondensationState = {
  now: number;
  deviceId: string;
  site: Site;
  reading: Reading | null;
  weather: (WeatherSnapshot & { stale: boolean; error: string | null }) | null;
  assessment: Assessment | null;
  unavailable: CondensationUnavailable | null;
};
