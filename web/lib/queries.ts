import "server-only";

import type { InStatement, Row } from "@libsql/client";
import { siteFor } from "@/config/sites";
import { assessCondensation } from "./condensation";
import { getDb } from "./db";
import { breakGaps, RANGES, ROLLUP_RES, type RangeKey } from "./history";
import { nodeStatus, SENSOR_STATE_KINDS, sensorStatus } from "./status";
import { LOG_LIMIT, mergeSummary, type SummaryRequest } from "./summary";
import {
  readingTime,
  type CondensationState,
  type DeviceHistory,
  type DeviceListItem,
  type DeviceSummary,
  type LogEntry,
  type RangeStats,
  type Reading,
  type SummaryUpdate,
} from "./types";
import { getWeather } from "./weather";

const TREND_WINDOW_S = 3 * 3600;
const TREND_BUCKET_S = 15 * 60; // must be one of ROLLUP_RES
const FINEST_RES = ROLLUP_RES[0];
const HOUR_AGO_TOLERANCE_S = 10 * 60;
/** A sealed container's moisture changes slowly, but not this slowly. */
const MAX_READING_AGE_FOR_RISK_S = 6 * 3600;

export const nowSeconds = () => Date.now() / 1000;

const num = (v: Row[string]) => Number(v);
const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;
const STATE_KINDS_SQL = SENSOR_STATE_KINDS.map((k) => `'${k}'`).join(", ");

function toReading(row: Row): Reading {
  return {
    ts: num(row.ts),
    receivedAt: num(row.received_at),
    tempC: num(row.temp_c),
    rhPct: num(row.rh_pct),
    dewPointC: num(row.dew_point_c),
    clockOk: num(row.clock_ok) === 1,
  };
}

export async function listDevices(): Promise<DeviceListItem[]> {
  const db = await getDb();
  const { rows } = await db.execute("SELECT id, first_seen_at, last_seen_at FROM devices ORDER BY last_seen_at DESC");
  return rows.map((r) => ({ id: String(r.id), firstSeenAt: num(r.first_seen_at), lastSeenAt: num(r.last_seen_at) }));
}

/** The requested device if it exists, else the most recently seen one. Null until any node has uploaded. */
export async function resolveDevice(requested: string | undefined) {
  const devices = await listDevices();
  if (devices.length === 0) return null;
  const deviceId = devices.find((d) => d.id === requested)?.id ?? devices[0].id;
  return { deviceId, devices };
}

export async function getSummary(
  deviceId: string,
  { after, stats: withStats }: SummaryRequest = { stats: true },
  now = nowSeconds(),
): Promise<SummaryUpdate | null> {
  const db = await getDb();
  const device = { device: deviceId };
  // With a cursor, read only rows added since. `+device_id` keeps SQLite on the
  // id range instead of scanning every row the device has through its index.
  const newest = (table: string, columns: string, afterId: number | undefined): InStatement =>
    afterId == null
      ? { sql: `SELECT ${columns} FROM ${table} WHERE device_id = :device ORDER BY ts DESC LIMIT :limit`, args: { ...device, limit: LOG_LIMIT } }
      : {
          sql: `SELECT ${columns} FROM ${table} WHERE id > :after AND +device_id = :device ORDER BY id DESC LIMIT :limit`,
          args: { ...device, after: afterId, limit: LOG_LIMIT },
        };

  const live: InStatement[] = [
    { sql: "SELECT first_seen_at, last_seen_at FROM devices WHERE id = :device", args: device },
    {
      sql: `SELECT ts, received_at, temp_c, rh_pct, dew_point_c, clock_ok FROM readings
            WHERE device_id = :device ORDER BY received_at DESC, ts DESC LIMIT 1`,
      args: device,
    },
    {
      sql: `SELECT kind, ts FROM events WHERE device_id = :device AND kind IN (${STATE_KINDS_SQL})
            ORDER BY ts DESC LIMIT 1`,
      args: device,
    },
    {
      sql: "SELECT ts FROM events WHERE device_id = :device AND kind = 'logger_started' ORDER BY ts DESC LIMIT 1",
      args: device,
    },
    newest("readings", "id, source_id, ts, received_at, temp_c, rh_pct, dew_point_c, clock_ok", after?.reading),
    newest("events", "id, source_id, ts, received_at, kind, detail", after?.event),
    // Same snapshot as the reads above, so nothing falls between this cursor and the next poll.
    "SELECT COALESCE((SELECT MAX(id) FROM readings), 0) AS reading, COALESCE((SELECT MAX(id) FROM events), 0) AS event",
  ];
  const slow: InStatement[] = [
    // From the rollups, so each stat reads a bucket per row instead of every reading.
    {
      sql: `WITH ref AS (SELECT MAX(bucket) - 3600 AS t FROM rollups WHERE device_id = :device AND res = :res)
            SELECT temp_sum / n AS temp_c, rh_sum / n AS rh_pct, dew_sum / n AS dew_point_c FROM rollups, ref
            WHERE device_id = :device AND res = :res AND bucket BETWEEN ref.t - :tolerance AND ref.t + :tolerance
            ORDER BY ABS(bucket - ref.t) LIMIT 1`,
      args: { ...device, res: FINEST_RES, tolerance: HOUR_AGO_TOLERANCE_S },
    },
    {
      sql: "SELECT COUNT(*) AS n FROM events WHERE device_id = :device AND kind = 'logger_started' AND ts > :since",
      args: { ...device, since: now - 86400 },
    },
    {
      sql: "SELECT COALESCE(SUM(n), 0) AS n FROM rollups WHERE device_id = :device AND res = :res AND bucket >= :since",
      args: { ...device, res: FINEST_RES, since: now - 3600 },
    },
    {
      sql: `SELECT ts_sum / n AS t, temp_sum / n AS temp, rh_sum / n AS rh, dew_sum / n AS dew FROM rollups
            WHERE device_id = :device AND res = :res AND bucket >= :since ORDER BY bucket`,
      args: { ...device, res: TREND_BUCKET_S, since: now - TREND_WINDOW_S },
    },
  ];
  const [dev, latest, state, start, readingLog, eventLog, maxIds, hourAgo, restarts, lastHour, trend] = await db.batch(
    withStats ? [...live, ...slow] : live,
    "read",
  );
  if (dev.rows.length === 0) return null;

  const lastSeenAt = num(dev.rows[0].last_seen_at);
  const latestReading = latest.rows.length ? toReading(latest.rows[0]) : null;
  const lastStateEvent = state.rows.length ? { kind: String(state.rows[0].kind), ts: num(state.rows[0].ts) } : null;
  const lastLoggerStart = start.rows.length ? num(start.rows[0].ts) : null;

  const events = eventLog.rows.map(
    (e): LogEntry => ({
      type: "event",
      key: `e${e.id}`,
      sourceId: e.source_id == null ? null : num(e.source_id),
      ts: num(e.ts),
      receivedAt: num(e.received_at),
      kind: String(e.kind),
      detail: e.detail == null ? null : String(e.detail),
    }),
  );
  const log: LogEntry[] = [
    ...readingLog.rows.map((r): LogEntry => ({ type: "reading", key: `r${r.id}`, sourceId: num(r.source_id), ...toReading(r) })),
    ...events,
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, LOG_LIMIT);

  const node = nodeStatus(lastSeenAt, now);
  const sensor = sensorStatus({
    node,
    lastStateEvent,
    lastLoggerStart,
    lastReadingAt: latestReading ? readingTime(latestReading) : null,
    now,
  });

  const ago = hourAgo?.rows[0];
  return {
    now,
    deviceId,
    site: siteFor(deviceId),
    firstSeenAt: num(dev.rows[0].first_seen_at),
    lastSeenAt,
    lastStateEvent,
    lastLoggerStart,
    latest: latestReading,
    log,
    cursor: { reading: num(maxIds.rows[0].reading), event: num(maxIds.rows[0].event) },
    status: { node, sensor: sensor.status, sensorSince: sensor.since },
    stats: withStats
      ? {
          statsAt: now,
          restarts24h: num(restarts.rows[0].n),
          hourAgo: ago ? { tempC: round(num(ago.temp_c)), rhPct: round(num(ago.rh_pct)), dewPointC: round(num(ago.dew_point_c)) } : null,
          trend: trend.rows.map((r) => ({
            t: Math.round(num(r.t)),
            tempC: round(num(r.temp)),
            rhPct: round(num(r.rh)),
            dewPointC: round(num(r.dew)),
          })),
          readingsLastHour: num(lastHour.rows[0].n),
        }
      : null,
  };
}

/** Everything the dashboard shows, for the server-rendered first paint. */
export async function getFullSummary(deviceId: string): Promise<DeviceSummary | null> {
  const update = await getSummary(deviceId);
  return update && mergeSummary(undefined, update);
}

export async function getHistory(deviceId: string, range: RangeKey, now = nowSeconds()): Promise<DeviceHistory> {
  const db = await getDb();
  const { seconds, bucket, rollup } = RANGES[range];
  const from = now - seconds;
  const window = { device: deviceId, from, to: now };
  // Pre-averaged rollup rows (at most ~2,900), combined into `bucket`-wide points.
  const buckets = { ...window, res: rollup };
  const [series, stats, unsynced] = await db.batch(
    [
      {
        sql: `SELECT SUM(ts_sum) / SUM(n) AS t, SUM(temp_sum) / SUM(n) AS temp, SUM(rh_sum) / SUM(n) AS rh,
                SUM(dew_sum) / SUM(n) AS dew FROM rollups
              WHERE device_id = :device AND res = :res AND bucket BETWEEN :from AND :to
              GROUP BY CAST(bucket / :bucket AS INTEGER) ORDER BY t`,
        args: { ...buckets, bucket },
      },
      {
        sql: `SELECT SUM(n) AS n,
                MIN(temp_min) AS temp_min, MAX(temp_max) AS temp_max, SUM(temp_sum) / SUM(n) AS temp_avg,
                MIN(rh_min) AS rh_min, MAX(rh_max) AS rh_max, SUM(rh_sum) / SUM(n) AS rh_avg,
                MIN(dew_min) AS dew_min, MAX(dew_max) AS dew_max, SUM(dew_sum) / SUM(n) AS dew_avg
              FROM rollups WHERE device_id = :device AND res = :res AND bucket BETWEEN :from AND :to`,
        args: buckets,
      },
      {
        sql: `SELECT COUNT(*) AS n FROM readings INDEXED BY readings_unsynced
              WHERE device_id = :device AND clock_ok = 0 AND received_at BETWEEN :from AND :to`,
        args: window,
      },
    ],
    "read",
  );

  const s = stats.rows[0];
  const stat = (prefix: string): RangeStats => ({
    min: round(num(s[`${prefix}_min`])),
    max: round(num(s[`${prefix}_max`])),
    avg: round(num(s[`${prefix}_avg`])),
  });
  const points = series.rows.map((r) => ({
    t: Math.round(num(r.t)),
    temp: round(num(r.temp)),
    rh: round(num(r.rh)),
    dew: round(num(r.dew)),
  }));

  return {
    range,
    from,
    to: now,
    bucket,
    points: breakGaps(points, bucket),
    stats: num(s.n) > 0 ? { temp: stat("temp"), rh: stat("rh"), dew: stat("dew") } : null,
    unsynced: num(unsynced.rows[0].n),
  };
}

export async function getCondensation(deviceId: string, now = nowSeconds()): Promise<CondensationState> {
  const site = siteFor(deviceId);
  const db = await getDb();
  const [latest, weather] = await Promise.all([
    db.execute({
      sql: `SELECT ts, received_at, temp_c, rh_pct, dew_point_c, clock_ok FROM readings
            WHERE device_id = ? ORDER BY received_at DESC, ts DESC LIMIT 1`,
      args: [deviceId],
    }),
    getWeather(site, now),
  ]);
  const reading = latest.rows.length ? toReading(latest.rows[0]) : null;
  const snapshot = weather.snapshot && {
    ...weather.snapshot,
    hourly: weather.snapshot.hourly.filter((h) => h.t >= now - 3600 && h.t <= now + 49 * 3600),
    stale: weather.stale,
    error: weather.error,
  };
  const state: CondensationState = { now, deviceId, site, reading, weather: snapshot, assessment: null, unavailable: null };

  if (!reading) return { ...state, unavailable: "no_reading" };
  if (now - readingTime(reading) > MAX_READING_AGE_FOR_RISK_S) return { ...state, unavailable: "stale_reading" };
  if (!snapshot) return { ...state, unavailable: "no_weather" };

  const current = snapshot.current;
  const assessment = assessCondensation({
    dewPointC: reading.dewPointC,
    outsideNow: current && now - current.t < 3 * 3600 ? { t: current.t, tempC: current.tempC } : null,
    forecast: snapshot.hourly.map((h) => ({ t: h.t, tempC: h.tempC })),
    now,
  });
  return { ...state, assessment, unavailable: assessment ? null : "no_forecast" };
}
