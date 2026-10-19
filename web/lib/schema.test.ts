import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ROLLUP_RES } from "./history";
import { applySchema } from "./schema";

let db: Client;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await applySchema(db);
});

afterEach(() => db.close());

const T0 = 83_334 * 6 * 3600; // a multiple of every rollup width

async function insert(sourceId: number, ts: number, tempC: number, clockOk = 1) {
  const r = await db.execute({
    sql: `INSERT INTO readings (device_id, source_id, ts, temp_c, rh_pct, dew_point_c, clock_ok, received_at)
          VALUES ('node', ?, ?, ?, 50, 9, ?, ?) ON CONFLICT DO NOTHING`,
    args: [sourceId, ts, tempC, clockOk, ts + 1],
  });
  return r.rowsAffected;
}

const rollups = async () =>
  (await db.execute("SELECT res, bucket, n, ts_sum, temp_sum, temp_min, temp_max FROM rollups ORDER BY res, bucket")).rows.map(
    (r) => ({ ...r }),
  );

describe("rollups", () => {
  it("adds each new synced reading to a bucket at every width", async () => {
    await insert(1, T0 + 5, 20);
    await insert(2, T0 + 10, 22);
    await insert(3, T0 + 35, 18);

    const rows = await rollups();
    const finest = rows.filter((r) => r.res === 30);
    expect(finest).toEqual([
      { res: 30, bucket: T0, n: 2, ts_sum: 2 * T0 + 15, temp_sum: 42, temp_min: 20, temp_max: 22 },
      { res: 30, bucket: T0 + 30, n: 1, ts_sum: T0 + 35, temp_sum: 18, temp_min: 18, temp_max: 18 },
    ]);
    for (const res of ROLLUP_RES.slice(1)) {
      expect(rows.filter((r) => r.res === res)).toEqual([
        { res, bucket: T0, n: 3, ts_sum: 3 * T0 + 50, temp_sum: 60, temp_min: 18, temp_max: 22 },
      ]);
    }
  });

  it("ignores re-sent and unsynced readings", async () => {
    expect(await insert(1, T0 + 5, 20)).toBe(1);
    expect(await insert(1, T0 + 5, 20)).toBe(0); // retried batch
    await insert(2, T0 + 10, 99, 0); // clock not synced
    const finest = (await rollups()).filter((r) => r.res === 30);
    expect(finest).toEqual([{ res: 30, bucket: T0, n: 1, ts_sum: T0 + 5, temp_sum: 20, temp_min: 20, temp_max: 20 }]);
  });

  it("backfills readings stored before the rollups existed, once", async () => {
    for (let i = 0; i < 200; i++) await insert(i, T0 + i * 7, 15 + (i % 9));
    const built = await rollups();

    await db.execute("DELETE FROM rollups");
    await db.execute("DELETE FROM migrations");
    await applySchema(db);
    expect(await rollups()).toEqual(built);

    await db.execute("DELETE FROM rollups");
    await applySchema(db); // already applied: leaves the table alone
    expect(await rollups()).toEqual([]);
  });
});

describe("query plans", () => {
  const plan = async (sql: string) =>
    (await db.execute(`EXPLAIN QUERY PLAN ${sql}`)).rows.map((r) => String(r.detail)).join(" | ");

  it("reads a chart's buckets through the primary key", async () => {
    expect(await plan("SELECT * FROM rollups WHERE device_id = 'n' AND res = 900 AND bucket BETWEEN 1 AND 2")).toMatch(
      /SEARCH rollups USING PRIMARY KEY \(device_id=\? AND res=\? AND bucket>\? AND bucket<\?\)/,
    );
  });

  it("counts unsynced readings without touching synced ones", async () => {
    expect(
      await plan(
        "SELECT COUNT(*) FROM readings INDEXED BY readings_unsynced WHERE device_id = 'n' AND clock_ok = 0 AND received_at BETWEEN 1 AND 2",
      ),
    ).toMatch(/readings_unsynced/);
  });
});
