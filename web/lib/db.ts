import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

// libSQL speaks SQLite: a local file by default (zero setup), or a hosted Turso
// database when DATABASE_URL points at one. Serverless hosts need the hosted option.
const DEFAULT_URL = "file:data/sensor.db";

const SCHEMA = `
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
`;

type Connection = { client: Client; ready: Promise<void> };

// Kept on globalThis so dev-server hot reloads reuse one connection.
const cache = globalThis as typeof globalThis & { sensorDb?: Connection };

function connect(): Connection {
  const url = process.env.DATABASE_URL || DEFAULT_URL;
  if (url.startsWith("file:")) {
    if (process.env.VERCEL) {
      throw new Error("DATABASE_URL is not set. Serverless hosts can't keep a local SQLite file; point it at a Turso database.");
    }
    mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const ready = client.executeMultiple(SCHEMA);
  ready.catch(() => {
    if (cache.sensorDb?.client === client) cache.sensorDb = undefined; // retry on the next request
  });
  return { client, ready };
}

export async function getDb(): Promise<Client> {
  cache.sensorDb ??= connect();
  await cache.sensorDb.ready;
  return cache.sensorDb.client;
}
