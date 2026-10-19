// Fake sensor node for demos and local development. Posts exactly what
// sensor/uploader.py posts: a backfill of history in 200-row batches, then one
// reading every --interval seconds.
//
//   npm run simulate                                # local dev server, 24 h of history
//   npm run simulate -- --dew-point 12              # moist container: condensation risk
//   npm run simulate -- --url https://<site>/api/ingest --token <INGEST_TOKEN>
//
// Inside a sealed container the moisture is fixed, so the dew point barely moves
// while temperature follows the day and humidity moves opposite to it.

import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    url: { type: "string", default: process.env.INGEST_URL ?? "http://localhost:3000/api/ingest" },
    token: { type: "string", default: process.env.INGEST_TOKEN ?? "dev" },
    device: { type: "string", default: process.env.DEVICE_ID ?? "demo-node" },
    hours: { type: "string", default: "24" },
    "dew-point": { type: "string", default: "6" },
    interval: { type: "string", default: "30" },
    tz: { type: "string", default: "America/New_York" },
    once: { type: "boolean", default: false },
  },
});

const STEP = 30; // the logger reads every 30 s
const BATCH = 200; // and the uploader sends at most 200 rows per request
const interval = Number(opts.interval);
const dewBase = Number(opts["dew-point"]);

const clock = new Intl.DateTimeFormat("en-US", { timeZone: opts.tz, hourCycle: "h23", hour: "numeric", minute: "numeric" });
const localHour = (ts) => {
  const p = clock.formatToParts(new Date(ts * 1000));
  return Number(p.find((x) => x.type === "hour").value) + Number(p.find((x) => x.type === "minute").value) / 60;
};

// Deterministic per-timestamp noise, so a reading is the same however it's generated.
const noise = (ts, seed) => Math.sin(ts * 12.9898 + seed * 78.233) * 0.5;

function reading(id, ts) {
  const temp = 12 + 4 * Math.sin((2 * Math.PI * (localHour(ts) - 9)) / 24) + 0.6 * Math.sin(ts / 40_000) + 0.15 * noise(ts, 1);
  const dew = dewBase + 0.3 * Math.sin(ts / 200_000) + 0.08 * noise(ts, 2);
  const rh = 100 * Math.exp((17.625 * dew) / (243.04 + dew) - (17.625 * temp) / (243.04 + temp));
  return { id, ts, temp_c: Math.round(temp * 10) / 10, rh_pct: Math.min(100, Math.round(rh * 10) / 10), clock_ok: 1 };
}

async function post(readings, events) {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
    body: JSON.stringify({ device_id: opts.device, readings, events }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error ?? res.statusText}`);
  return body;
}

/** Resume after the newest reading the server already has, so restarts don't overlap history. */
async function lastServerReading() {
  const url = new URL(`/api/devices/${encodeURIComponent(opts.device)}/summary`, opts.url);
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()).latest?.ts ?? null;
}

const now = () => Date.now() / 1000;
const last = await lastServerReading();
let ts = Math.max(last ?? 0, now() - Number(opts.hours) * 3600) + STEP;
let readingId = Math.floor(ts / STEP); // unique and increasing, like the node's AUTOINCREMENT
let eventId = readingId;

// Backfill, with the logger starting at the beginning and one sensor dropout mid-way.
const events = [];
if (last == null) {
  events.push({ id: eventId++, ts: ts - 5, kind: "logger_started", detail: null });
  events.push({ id: eventId++, ts, kind: "ok", detail: null });
}
const outage = now() - Number(opts.hours) * 1800; // halfway through the history
const rows = [];
for (; ts <= now(); ts += STEP) {
  if (last == null && ts >= outage && ts < outage + 8 * 60) {
    if (!events.some((e) => e.kind === "sensor_silent")) events.push({ id: eventId++, ts, kind: "sensor_silent", detail: null });
    continue;
  }
  if (events.at(-1)?.kind === "sensor_silent") events.push({ id: eventId++, ts, kind: "ok", detail: null });
  rows.push(reading(readingId++, ts));
}

console.log(`Simulating "${opts.device}" -> ${opts.url}`);
for (let i = 0; i < rows.length || events.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const until = batch.at(-1)?.ts ?? Infinity;
  const due = events.filter((e) => e.ts <= until);
  events.splice(0, due.length);
  const result = await post(batch, due);
  console.log(`  backfill: ${result.readings.inserted} readings, ${result.events.inserted} events stored`);
}
if (opts.once) process.exit(0);

console.log(`Live: one reading every ${interval} s (Ctrl+C to stop)`);
setInterval(async () => {
  const r = reading(readingId++, now());
  try {
    await post([r], []);
    console.log(`  ${new Date().toLocaleTimeString()}  ${r.temp_c} °C  ${r.rh_pct} %RH`);
  } catch (err) {
    console.error(`  upload failed: ${err.message}`); // the real uploader keeps the row and retries
  }
}, interval * 1000);
