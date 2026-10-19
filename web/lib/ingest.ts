import "server-only";

import type { InStatement } from "@libsql/client";
import { getDb } from "./db";
import { dewPoint } from "./dewpoint";
import type { Upload } from "./payload";
import { NODE_OFFLINE_AFTER_S } from "./status";

export type RowCounts = { inserted: number; duplicates: number; invalid: number };
export type IngestResult = { readings: RowCounts; events: RowCounts };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Stores one upload atomically. Re-sent rows are ignored, so the uploader can safely retry. */
export async function recordUpload(upload: Upload, now: number): Promise<IngestResult> {
  const db = await getDb();
  const { deviceId, readings, events } = upload;

  const previous = await db.execute({ sql: "SELECT last_seen_at FROM devices WHERE id = ?", args: [deviceId] });
  const lastSeenAt = previous.rows.length ? Number(previous.rows[0].last_seen_at) : null;

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO devices (id, first_seen_at, last_seen_at) VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      args: [deviceId, now, now],
    },
  ];

  // The node can't report its own outages, so the server notes connectivity changes.
  const serverEvent = (kind: string, detail: string | null): InStatement => ({
    sql: "INSERT INTO events (device_id, source_id, ts, kind, detail, received_at) VALUES (?, NULL, ?, ?, ?, ?)",
    args: [deviceId, now, kind, detail, now],
  });
  if (lastSeenAt == null) statements.push(serverEvent("node_connected", null));
  else if (now - lastSeenAt > NODE_OFFLINE_AFTER_S) {
    statements.push(serverEvent("node_reconnected", String(Math.round(now - lastSeenAt))));
  }
  const fixed = statements.length;

  for (const r of readings) {
    statements.push({
      sql: `INSERT INTO readings (device_id, source_id, ts, temp_c, rh_pct, dew_point_c, clock_ok, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      args: [deviceId, r.sourceId, r.ts, r.tempC, r.rhPct, round2(dewPoint(r.tempC, r.rhPct)), r.clockOk ? 1 : 0, now],
    });
  }
  for (const e of events) {
    statements.push({
      sql: `INSERT INTO events (device_id, source_id, ts, kind, detail, received_at)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      args: [deviceId, e.sourceId, e.ts, e.kind, e.detail, now],
    });
  }

  const results = await db.batch(statements, "write");
  const inserted = (from: number, count: number) =>
    results.slice(from, from + count).reduce((n, r) => n + r.rowsAffected, 0);

  const readingsInserted = inserted(fixed, readings.length);
  const eventsInserted = inserted(fixed + readings.length, events.length);
  return {
    readings: { inserted: readingsInserted, duplicates: readings.length - readingsInserted, invalid: upload.invalid.readings },
    events: { inserted: eventsInserted, duplicates: events.length - eventsInserted, invalid: upload.invalid.events },
  };
}
