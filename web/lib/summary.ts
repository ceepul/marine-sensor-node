// Incremental summary polling. The browser polls every few seconds, so each poll
// asks only for log entries after its cursor, and for the slow stats once a minute.

import type { DeviceSummary, LogCursor, LogEntry, SummaryUpdate } from "./types";

export const LOG_LIMIT = 40;
export const STATS_EVERY_S = 60;

export type SummaryRequest = { after?: LogCursor; stats: boolean };

/** Query string for the next poll after `prev`. */
export function nextSummaryQuery(prev: DeviceSummary): string {
  const params = new URLSearchParams({ after: `${prev.cursor.reading}.${prev.cursor.event}` });
  if (prev.now - prev.statsAt >= STATS_EVERY_S) params.set("stats", "1");
  return params.toString();
}

/** Without a valid `after`, the request is a full one: whole log and stats. */
export function parseSummaryQuery(params: URLSearchParams): SummaryRequest {
  const match = /^(\d+)\.(\d+)$/.exec(params.get("after") ?? "");
  if (!match) return { stats: true };
  return { after: { reading: Number(match[1]), event: Number(match[2]) }, stats: params.get("stats") === "1" };
}

/** Newest first, at most LOG_LIMIT, each entry once. */
export function mergeLog(prev: LogEntry[], fresh: LogEntry[]): LogEntry[] {
  const byKey = new Map([...prev, ...fresh].map((e) => [e.key, e]));
  return [...byKey.values()].sort((a, b) => b.ts - a.ts).slice(0, LOG_LIMIT);
}

/** Applies a poll's update to what the client already has. */
export function mergeSummary(prev: DeviceSummary | undefined, update: SummaryUpdate): DeviceSummary {
  const { stats: fresh, ...live } = update;
  const stats = fresh ?? prev;
  if (!stats) throw new Error("The first summary must include stats.");
  const { statsAt, restarts24h, hourAgo, trend, readingsLastHour } = stats;
  return {
    ...live,
    statsAt,
    restarts24h,
    hourAgo,
    trend,
    readingsLastHour,
    log: prev ? mergeLog(prev.log, live.log) : live.log,
  };
}
