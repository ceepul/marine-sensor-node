import "server-only";

import type { Site } from "@/config/sites";
import { getDb } from "./db";
import { OPEN_METEO_URL, forecastQuery, parseForecast } from "./open-meteo";
import type { WeatherSnapshot } from "./types";

// Forecasts change slowly, so each location is fetched at most every 30 minutes.
// Snapshots live in the database rather than memory so serverless instances share them.
export const WEATHER_TTL_S = 30 * 60;
const RETRY_AFTER_FAILURE_S = 2 * 60;

export type WeatherResult = { snapshot: WeatherSnapshot | null; stale: boolean; error: string | null };

const inflight = new Map<string, Promise<WeatherSnapshot>>();
const lastFailure = new Map<string, number>();

export async function getWeather(site: Site, now: number): Promise<WeatherResult> {
  const key = `${site.latitude.toFixed(3)},${site.longitude.toFixed(3)}`;
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT payload FROM weather_cache WHERE key = ?", args: [key] })).rows[0];
  const cached = row ? (JSON.parse(String(row.payload)) as WeatherSnapshot) : null;

  if (cached && now - cached.fetchedAt < WEATHER_TTL_S) return { snapshot: cached, stale: false, error: null };

  const failedAt = lastFailure.get(key);
  if (failedAt != null && now - failedAt < RETRY_AFTER_FAILURE_S) {
    return { snapshot: cached, stale: cached != null, error: "The weather service is unavailable." };
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = refresh(key, site, now).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    return { snapshot: await pending, stale: false, error: null };
  } catch (err) {
    lastFailure.set(key, now);
    console.error(`Weather fetch failed for ${key}:`, err);
    return { snapshot: cached, stale: cached != null, error: "The weather service is unavailable." };
  }
}

async function refresh(key: string, site: Site, now: number): Promise<WeatherSnapshot> {
  const res = await fetch(`${OPEN_METEO_URL}?${forecastQuery(site.latitude, site.longitude)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const snapshot = parseForecast(await res.json(), now);

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO weather_cache (key, fetched_at, payload) VALUES (?, ?, ?)
          ON CONFLICT (key) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload`,
    args: [key, snapshot.fetchedAt, JSON.stringify(snapshot)],
  });
  lastFailure.delete(key);
  return snapshot;
}
