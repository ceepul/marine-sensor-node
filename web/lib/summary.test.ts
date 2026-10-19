import { describe, expect, it } from "vitest";
import { DEFAULT_SITE } from "@/config/sites";
import { LOG_LIMIT, mergeLog, mergeSummary, nextSummaryQuery, parseSummaryQuery, STATS_EVERY_S } from "./summary";
import type { LogEntry, SummaryStats, SummaryUpdate } from "./types";

const NOW = 1_800_000_000;

const reading = (id: number, ts: number): LogEntry => ({
  type: "reading",
  key: `r${id}`,
  sourceId: id,
  ts,
  receivedAt: ts + 2,
  tempC: 20,
  rhPct: 50,
  dewPointC: 9.3,
  clockOk: true,
});

const stats = (statsAt: number): SummaryStats => ({ statsAt, restarts24h: 0, hourAgo: null, trend: [], readingsLastHour: 700 });

const update = (log: LogEntry[], cursor: number, withStats: SummaryStats | null, now = NOW): SummaryUpdate => ({
  now,
  deviceId: "node",
  site: DEFAULT_SITE,
  firstSeenAt: NOW - 86400,
  lastSeenAt: now - 2,
  lastStateEvent: null,
  lastLoggerStart: null,
  latest: null,
  log,
  cursor: { reading: cursor, event: 3 },
  status: { node: "online", sensor: "ok", sensorSince: null },
  stats: withStats,
});

describe("summary query", () => {
  it("round-trips the cursor", () => {
    const prev = mergeSummary(undefined, update([], 120, stats(NOW)));
    expect(nextSummaryQuery(prev)).toBe("after=120.3");
    expect(parseSummaryQuery(new URLSearchParams(nextSummaryQuery(prev)))).toEqual({
      after: { reading: 120, event: 3 },
      stats: false,
    });
  });

  it("asks for stats once they're a minute old", () => {
    const prev = mergeSummary(undefined, update([], 120, stats(NOW - STATS_EVERY_S)));
    expect(parseSummaryQuery(new URLSearchParams(nextSummaryQuery(prev))).stats).toBe(true);
  });

  it("treats a missing or malformed cursor as a full request", () => {
    expect(parseSummaryQuery(new URLSearchParams())).toEqual({ stats: true });
    expect(parseSummaryQuery(new URLSearchParams("after=abc"))).toEqual({ stats: true });
  });
});

describe("mergeSummary", () => {
  it("adds new log lines and keeps the stats it already has", () => {
    const first = mergeSummary(undefined, update([reading(1, NOW - 10)], 1, stats(NOW - 10)));
    const next = mergeSummary(first, update([reading(2, NOW - 5)], 2, null, NOW + 3));
    expect(next.log.map((e) => e.key)).toEqual(["r2", "r1"]);
    expect(next.cursor.reading).toBe(2);
    expect(next.now).toBe(NOW + 3);
    expect(next.statsAt).toBe(NOW - 10);
  });

  it("needs stats on the first summary", () => {
    expect(() => mergeSummary(undefined, update([], 0, null))).toThrow();
  });
});

describe("mergeLog", () => {
  it("keeps the newest LOG_LIMIT entries once each", () => {
    const old = Array.from({ length: LOG_LIMIT }, (_, i) => reading(i, NOW - 1000 + i));
    const merged = mergeLog(old, [reading(LOG_LIMIT - 1, NOW - 1000 + LOG_LIMIT - 1), reading(500, NOW)]);
    expect(merged).toHaveLength(LOG_LIMIT);
    expect(merged[0].key).toBe("r500");
    expect(new Set(merged.map((e) => e.key)).size).toBe(LOG_LIMIT);
    expect(merged.at(-1)?.key).toBe("r1"); // r0, the oldest, dropped
  });
});
