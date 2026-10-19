import "server-only";

import type { Row } from "@libsql/client";
import { siteFor } from "@/config/sites";
import { assessCondensation } from "./condensation";
import { getDb } from "./db";
import { breakGaps, RANGES, type RangeKey } from "./history";
import { nodeStatus, SENSOR_STATE_KINDS, sensorStatus } from "./status";
import {
  readingTime,
  type CondensationState,
  type DeviceHistory,
  type DeviceListItem,
  type DeviceSummary,
  type LogEntry,
  type RangeStats,
  type Reading,
} from "./types";
import { getWeather } from "./weather";

const LOG_LIMIT = 40;
const TREND_WINDOW_S = 3 * 3600;
const TREND_BUCKET_S = 15 * 60;
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

export async function getSummary(deviceId: string, now = nowSeconds()): Promise<DeviceSummary | null> {
  const db = await getDb();
  const device = { device: deviceId };
  const [dev, latest, hourAgo, state, starts, lastHour, trend, readingLog, eventLog] = await db.batch(
    [
      { sql: "SELECT first_seen_at, last_seen_at FROM devices WHERE id = :device", args: device },
      {
        sql: `SELECT ts, received_at, temp_c, rh_pct, dew_point_c, clock_ok FROM readings
              WHERE device_id = :device ORDER BY received_at DESC, ts DESC LIMIT 1`,
        args: device,
      },
      {
        sql: `WITH ref AS (SELECT MAX(ts) - 3600 AS t FROM readings WHERE device_id = :device AND clock_ok = 1)
              SELECT temp_c, rh_pct, dew_point_c FROM readings, ref
              WHERE device_id = :device AND clock_ok = 1 AND ts BETWEEN ref.t - :tolerance AND ref.t + :tolerance
              ORDER BY ABS(ts - ref.t) LIMIT 1`,
        args: { ...device, tolerance: HOUR_AGO_TOLERANCE_S },
      },
      {
        sql: `SELECT kind, ts FROM events WHERE device_id = :device AND kind IN (${STATE_KINDS_SQL})
              ORDER BY ts DESC LIMIT 1`,
        args: device,
      },
      {
        sql: `SELECT MAX(ts) AS last_start, COUNT(CASE WHEN ts > :since THEN 1 END) AS restarts
              FROM events WHERE device_id = :device AND kind = 'logger_started'`,
        args: { ...device, since: now - 86400 },
      },
      {
        sql: "SELECT COUNT(*) AS n FROM readings WHERE device_id = :device AND clock_ok = 1 AND ts > :since",
        args: { ...device, since: now - 3600 },
      },
      {
        sql: `SELECT AVG(ts) AS t, AVG(temp_c) AS temp, AVG(rh_pct) AS rh, AVG(dew_point_c) AS dew FROM readings
              WHERE device_id = :device AND clock_ok = 1 AND ts > :since
              GROUP BY CAST(ts / :bucket AS INTEGER) ORDER BY t`,
        args: { ...device, since: now - TREND_WINDOW_S, bucket: TREND_BUCKET_S },
      },
      {
        sql: `SELECT id, source_id, ts, received_at, temp_c, rh_pct, dew_point_c, clock_ok FROM readings
              WHERE device_id = :device ORDER BY ts DESC LIMIT :limit`,
        args: { ...device, limit: LOG_LIMIT },
      },
      {
        sql: `SELECT id, source_id, ts, received_at, kind, detail FROM events
              WHERE device_id = :device ORDER BY ts DESC LIMIT :limit`,
        args: { ...device, limit: LOG_LIMIT },
      },
    ],
    "read",
  );
  if (dev.rows.length === 0) return null;

  const lastSeenAt = num(dev.rows[0].last_seen_at);
  const latestReading = latest.rows.length ? toReading(latest.rows[0]) : null;
  const lastStateEvent = state.rows.length ? { kind: String(state.rows[0].kind), ts: num(state.rows[0].ts) } : null;
  const lastLoggerStart = starts.rows[0].last_start == null ? null : num(starts.rows[0].last_start);
  const ago = hourAgo.rows[0];

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

  return {
    now,
    deviceId,
    site: siteFor(deviceId),
    firstSeenAt: num(dev.rows[0].first_seen_at),
    lastSeenAt,
    lastStateEvent,
    lastLoggerStart,
    restarts24h: num(starts.rows[0].restarts),
    latest: latestReading,
    hourAgo: ago ? { tempC: num(ago.temp_c), rhPct: num(ago.rh_pct), dewPointC: num(ago.dew_point_c) } : null,
    trend: trend.rows.map((r) => ({
      t: Math.round(num(r.t)),
      tempC: round(num(r.temp)),
      rhPct: round(num(r.rh)),
      dewPointC: round(num(r.dew)),
    })),
    readingsLastHour: num(lastHour.rows[0].n),
    log,
    status: { node, sensor: sensor.status, sensorSince: sensor.since },
  };
}

export async function getHistory(deviceId: string, range: RangeKey, now = nowSeconds()): Promise<DeviceHistory> {
  const db = await getDb();
  const { seconds, bucket } = RANGES[range];
  const from = now - seconds;
  const window = { device: deviceId, from, to: now };
  const [series, stats, unsynced] = await db.batch(
    [
      {
        sql: `SELECT AVG(ts) AS t, AVG(temp_c) AS temp, AVG(rh_pct) AS rh, AVG(dew_point_c) AS dew FROM readings
              WHERE device_id = :device AND clock_ok = 1 AND ts BETWEEN :from AND :to
              GROUP BY CAST(ts / :bucket AS INTEGER) ORDER BY t`,
        args: { ...window, bucket },
      },
      {
        sql: `SELECT COUNT(*) AS n,
                MIN(temp_c) AS temp_min, MAX(temp_c) AS temp_max, AVG(temp_c) AS temp_avg,
                MIN(rh_pct) AS rh_min, MAX(rh_pct) AS rh_max, AVG(rh_pct) AS rh_avg,
                MIN(dew_point_c) AS dew_min, MAX(dew_point_c) AS dew_max, AVG(dew_point_c) AS dew_avg
              FROM readings WHERE device_id = :device AND clock_ok = 1 AND ts BETWEEN :from AND :to`,
        args: window,
      },
      {
        sql: `SELECT COUNT(*) AS n FROM readings
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
