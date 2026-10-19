import { zoneOffset, zonedParts } from "./format";

/**
 * Bucket widths (s) that readings are pre-averaged into as they arrive (see schema.ts),
 * so a chart reads buckets rather than every reading in its range.
 */
export const ROLLUP_RES = [30, 15 * 60] as const;
export type RollupRes = (typeof ROLLUP_RES)[number];

// Each range draws a similar number of points (96-168), however long it is: `rollup`
// buckets are read and combined into `bucket`-wide points. The sensor itself only
// updates every 30 s, so 1H shows every distinct value.
export const RANGES = {
  "1h": { label: "1H", seconds: 3600, bucket: 30, rollup: 30 }, // reads 120 rows, 120 points
  "6h": { label: "6H", seconds: 6 * 3600, bucket: 3 * 60, rollup: 30 }, // 720 rows, 120 points
  "24h": { label: "24H", seconds: 24 * 3600, bucket: 15 * 60, rollup: 15 * 60 }, // 96 rows, 96 points
  "7d": { label: "7D", seconds: 7 * 86400, bucket: 3600, rollup: 15 * 60 }, // 672 rows, 168 points
  "30d": { label: "30D", seconds: 30 * 86400, bucket: 6 * 3600, rollup: 15 * 60 }, // 2,880 rows, 120 points
} as const satisfies Record<string, { label: string; seconds: number; bucket: number; rollup: RollupRes }>;

export type RangeKey = keyof typeof RANGES;
export const DEFAULT_RANGE: RangeKey = "24h";
export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && Object.hasOwn(RANGES, value);
}

export type SeriesPoint = { t: number; temp: number | null; rh: number | null; dew: number | null };

/** Adds an empty point inside every gap so a line breaks across missing data instead of bridging it. */
export function breakGaps(points: SeriesPoint[], bucketSeconds: number): SeriesPoint[] {
  const maxGap = Math.max(bucketSeconds * 2.5, 150);
  const out: SeriesPoint[] = [];
  for (const p of points) {
    const prev = out.at(-1);
    if (prev && p.t - prev.t > maxGap) out.push({ t: (prev.t + p.t) / 2, temp: null, rh: null, dew: null });
    out.push(p);
  }
  return out;
}

const TICK_STEPS = [300, 900, 1800, 3600, 2 * 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 2 * 86400, 7 * 86400];

/** Axis ticks on round wall-clock times (local hours, midnights) in `timeZone`. */
export function timeTicks(from: number, to: number, timeZone: string, maxTicks = 8): number[] {
  const span = Math.max(to - from, 1);
  const step = TICK_STEPS.find((s) => span / s <= maxTicks) ?? TICK_STEPS.at(-1)!;
  const offset = zoneOffset(from, timeZone);
  const ticks: number[] = [];
  for (let local = Math.ceil((from + offset) / step) * step; ticks.length < 50; local += step) {
    const t = local - zoneOffset(local - offset, timeZone); // re-resolve the offset in case DST changed
    if (t > to) break;
    if (t >= from) ticks.push(t);
  }
  return ticks;
}

/** True when `t` falls on local midnight, where an axis should show the date instead of the time. */
export function isLocalMidnight(t: number, timeZone: string): boolean {
  const p = zonedParts(t, timeZone);
  return p.hour === 0 && p.minute === 0;
}
