import type { Client } from "@libsql/client";
import { ROLLUP_RES } from "./history";

// Kept apart from db.ts (server-only) so tests can apply it to a scratch database.

const TABLES = `
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  first_seen_at REAL NOT NULL,              -- server clock, UTC seconds
  last_seen_at  REAL NOT NULL               -- every upload, heartbeats included
);

CREATE TABLE IF NOT EXISTS readings (
  id          INTEGER PRIMARY KEY,
  device_id   TEXT    NOT NULL,
  source_id   INTEGER NOT NULL,             -- row id in the node's local buffer
  ts          REAL    NOT NULL,             -- node clock, UTC seconds
  temp_c      REAL    NOT NULL,
  rh_pct      REAL    NOT NULL,
  dew_point_c REAL    NOT NULL,
  clock_ok    INTEGER NOT NULL,             -- 1 if the node's clock was NTP-synced
  received_at REAL    NOT NULL              -- server clock
);
-- A retried batch repeats (source_id, ts) and is ignored. A node whose local
-- database was reset reuses source ids, but never with the same ts.
CREATE UNIQUE INDEX IF NOT EXISTS readings_dedupe ON readings (device_id, source_id, ts);
CREATE INDEX IF NOT EXISTS readings_by_time ON readings (device_id, ts);
CREATE INDEX IF NOT EXISTS readings_by_arrival ON readings (device_id, received_at);
-- Unsynced readings are rare; this lets the history count them without scanning the rest.
CREATE INDEX IF NOT EXISTS readings_unsynced ON readings (device_id, received_at) WHERE clock_ok = 0;

-- Synced readings pre-averaged into buckets of each width in ROLLUP_RES, so a chart
-- reads one row per bucket instead of every reading in its range. Kept current by
-- the trigger below. Averages are sum / n.
CREATE TABLE IF NOT EXISTS rollups (
  device_id TEXT    NOT NULL,
  res       INTEGER NOT NULL,               -- bucket width, seconds
  bucket    INTEGER NOT NULL,               -- bucket start, UTC seconds (a multiple of res)
  n         INTEGER NOT NULL,
  ts_sum    REAL    NOT NULL,
  temp_sum  REAL    NOT NULL, temp_min REAL NOT NULL, temp_max REAL NOT NULL,
  rh_sum    REAL    NOT NULL, rh_min   REAL NOT NULL, rh_max   REAL NOT NULL,
  dew_sum   REAL    NOT NULL, dew_min  REAL NOT NULL, dew_max  REAL NOT NULL,
  PRIMARY KEY (device_id, res, bucket)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  device_id   TEXT    NOT NULL,
  source_id   INTEGER,                      -- NULL for events the server records itself
  ts          REAL    NOT NULL,
  kind        TEXT    NOT NULL,
  detail      TEXT,
  received_at REAL    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS events_dedupe ON events (device_id, source_id, ts);
CREATE INDEX IF NOT EXISTS events_by_time ON events (device_id, ts);

CREATE TABLE IF NOT EXISTS weather_cache (
  key        TEXT PRIMARY KEY,              -- "lat,lon"
  fetched_at REAL NOT NULL,
  payload    TEXT NOT NULL                  -- WeatherSnapshot JSON
);

CREATE TABLE IF NOT EXISTS migrations (
  name       TEXT PRIMARY KEY,
  applied_at REAL NOT NULL
);
`;

const ROLLUP_COLUMNS =
  "device_id, res, bucket, n, ts_sum, temp_sum, temp_min, temp_max, rh_sum, rh_min, rh_max, dew_sum, dew_min, dew_max";

const merge = (metric: string) =>
  `${metric}_sum = ${metric}_sum + excluded.${metric}_sum, ` +
  `${metric}_min = MIN(${metric}_min, excluded.${metric}_min), ${metric}_max = MAX(${metric}_max, excluded.${metric}_max)`;

/** Adds each newly stored reading to its bucket at every width. Ignored duplicates don't fire it. */
const ROLLUP_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS readings_rollup AFTER INSERT ON readings WHEN NEW.clock_ok = 1
BEGIN
${ROLLUP_RES.map(
  (res) => `  INSERT INTO rollups (${ROLLUP_COLUMNS})
  VALUES (NEW.device_id, ${res}, CAST(NEW.ts / ${res} AS INTEGER) * ${res}, 1, NEW.ts,
          NEW.temp_c, NEW.temp_c, NEW.temp_c, NEW.rh_pct, NEW.rh_pct, NEW.rh_pct,
          NEW.dew_point_c, NEW.dew_point_c, NEW.dew_point_c)
  ON CONFLICT (device_id, res, bucket) DO UPDATE SET
    n = n + 1, ts_sum = ts_sum + excluded.ts_sum, ${merge("temp")}, ${merge("rh")}, ${merge("dew")};`,
).join("\n")}
END`;

/** Rebuilds every bucket from the stored readings, replacing what's there. */
const rebuildRollups = (res: number) => `
INSERT INTO rollups (${ROLLUP_COLUMNS})
SELECT device_id, ${res}, CAST(ts / ${res} AS INTEGER) * ${res} AS b, COUNT(*), SUM(ts),
       SUM(temp_c), MIN(temp_c), MAX(temp_c), SUM(rh_pct), MIN(rh_pct), MAX(rh_pct),
       SUM(dew_point_c), MIN(dew_point_c), MAX(dew_point_c)
FROM readings WHERE clock_ok = 1 GROUP BY device_id, b
ON CONFLICT (device_id, res, bucket) DO UPDATE SET
  n = excluded.n, ts_sum = excluded.ts_sum,
  temp_sum = excluded.temp_sum, temp_min = excluded.temp_min, temp_max = excluded.temp_max,
  rh_sum = excluded.rh_sum, rh_min = excluded.rh_min, rh_max = excluded.rh_max,
  dew_sum = excluded.dew_sum, dew_min = excluded.dew_min, dew_max = excluded.dew_max`;

/** One-off data changes, each applied once per database, in order. */
const MIGRATIONS: { name: string; statements: string[] }[] = [
  // Readings stored before the rollups existed. Safe to run twice: it rebuilds, not adds.
  { name: "rollups_v1", statements: ROLLUP_RES.map(rebuildRollups) },
];

/** Creates or upgrades the schema. Runs once per connection, so it's cheap when there's nothing to do. */
export async function applySchema(client: Client): Promise<void> {
  await client.executeMultiple(TABLES);
  await client.execute(ROLLUP_TRIGGER); // the trigger body has semicolons, so on its own
  const { rows } = await client.execute("SELECT name FROM migrations");
  const applied = new Set(rows.map((r) => String(r.name)));
  for (const { name, statements } of MIGRATIONS) {
    if (applied.has(name)) continue;
    await client.batch(
      [
        ...statements,
        { sql: "INSERT INTO migrations (name, applied_at) VALUES (?, ?) ON CONFLICT DO NOTHING", args: [name, Date.now() / 1000] },
      ],
      "write",
    );
  }
}
