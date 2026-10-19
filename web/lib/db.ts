import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { applySchema } from "./schema";

// libSQL speaks SQLite: a local file by default (zero setup), or a hosted Turso
// database when DATABASE_TURSO_DATABASE_URL points at one. Serverless hosts need the hosted option.
const DEFAULT_URL = "file:data/sensor.db";

type Connection = { client: Client; ready: Promise<void> };

// Kept on globalThis so dev-server hot reloads reuse one connection.
const cache = globalThis as typeof globalThis & { sensorDb?: Connection };

function connect(): Connection {
  // Set by the Vercel Turso integration.
  const url = process.env.DATABASE_TURSO_DATABASE_URL || DEFAULT_URL;
  const authToken = process.env.DATABASE_TURSO_AUTH_TOKEN;
  if (url.startsWith("file:")) {
    if (process.env.VERCEL) {
      throw new Error(
        "DATABASE_TURSO_DATABASE_URL is not set. Serverless hosts can't keep a local SQLite file; connect the Turso integration.",
      );
    }
    mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  }
  const client = createClient({ url, authToken });
  const ready = applySchema(client);
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
