import { zoneOffset, zonedParts } from "./format";

// Each range is averaged into buckets so a chart never draws more than ~360 points.
export const RANGES = {
  "1h": { label: "1H", seconds: 3600, bucket: 30 },
  "6h": { label: "6H", seconds: 6 * 3600, bucket: 60 },
  "24h": { label: "24H", seconds: 24 * 3600, bucket: 5 * 60 },
  "7d": { label: "7D", seconds: 7 * 86400, bucket: 30 * 60 },
  "30d": { label: "30D", seconds: 30 * 86400, bucket: 2 * 3600 },
} as const;

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
