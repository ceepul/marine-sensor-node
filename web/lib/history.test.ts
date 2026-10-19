import { describe, expect, it } from "vitest";
import { formatClock } from "./format";
import { breakGaps, isLocalMidnight, isRangeKey, timeTicks, type SeriesPoint } from "./history";

const point = (t: number): SeriesPoint => ({ t, temp: 20, rh: 50, dew: 9 });

describe("breakGaps", () => {
  it("keeps a continuous series intact", () => {
    const points = [point(0), point(30), point(90), point(120)]; // one missed 30 s reading
    expect(breakGaps(points, 30)).toEqual(points);
  });

  it("inserts a break where data is missing", () => {
    const out = breakGaps([point(0), point(30), point(1000)], 30);
    expect(out).toHaveLength(4);
    expect(out[2]).toEqual({ t: 515, temp: null, rh: null, dew: null });
  });
});

describe("timeTicks", () => {
  const TZ = "America/New_York";
  const from = Date.UTC(2026, 9, 19, 13, 17) / 1000; // 09:17 local

  it("lands on round local hours", () => {
    const ticks = timeTicks(from, from + 6 * 3600, TZ);
    expect(ticks.map((t) => formatClock(t, TZ))).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
  });

  it("uses local midnights for multi-day ranges", () => {
    const ticks = timeTicks(from, from + 7 * 86400, TZ);
    expect(ticks).toHaveLength(7);
    expect(ticks.every((t) => isLocalMidnight(t, TZ))).toBe(true);
  });
});

describe("isRangeKey", () => {
  it("only accepts defined ranges", () => {
    expect(isRangeKey("24h")).toBe(true);
    expect(isRangeKey("toString")).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
  });
});
