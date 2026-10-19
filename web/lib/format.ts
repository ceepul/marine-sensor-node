// Formatting helpers. Every time is shown in the site's time zone and built from
// formatToParts, so the server render and the browser hydrate to identical strings.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NBSP = " "; // keeps a value and its unit on one line

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    const options: Intl.DateTimeFormatOptions = {
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    };
    try {
      f = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    } catch {
      f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }); // unknown zone name
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of a UTC-seconds timestamp in `timeZone`. */
export function zonedParts(ts: number, timeZone: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ts * 1000))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS.indexOf(out.weekday),
  };
}

/** Seconds to add to a UTC timestamp to get the zone's wall-clock time expressed as UTC. */
export function zoneOffset(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - Math.floor(ts);
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayNumber = (p: ZonedParts) => Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;

/** "14:32" or, with seconds, "14:32:05". */
export function formatClock(ts: number, timeZone: string, withSeconds = false): string {
  const p = zonedParts(ts, timeZone);
  return withSeconds ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "18 Oct" */
export function formatDate(ts: number, timeZone: string): string {
  const p = zonedParts(ts, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "18 Oct 2026, 14:32" */
export function formatDateTime(ts: number, timeZone: string): string {
  const p = zonedParts(ts, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Sun 18 Oct, 21:30" */
export function formatShortDateTime(ts: number, timeZone: string): string {
  const p = zonedParts(ts, timeZone);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "today 14:00", "tomorrow 03:00", "Wed 03:00" or "18 Oct 03:00", relative to `now`. */
export function formatDayTime(ts: number, timeZone: string, now: number): string {
  const p = zonedParts(ts, timeZone);
  const days = dayNumber(p) - dayNumber(zonedParts(now, timeZone));
  const clock = `${pad(p.hour)}:${pad(p.minute)}`;
  if (days === 0) return `today ${clock}`;
  if (days === 1) return `tomorrow ${clock}`;
  if (days === -1) return `yesterday ${clock}`;
  if (Math.abs(days) < 7) return `${WEEKDAYS[p.weekday]} ${clock}`;
  return `${p.day} ${MONTHS[p.month - 1]} ${clock}`;
}

/** Short zone label for captions, e.g. "America/New_York" -> "New York time". */
export function zoneLabel(timeZone: string): string {
  if (timeZone === "UTC") return "UTC";
  const city = timeZone.split("/").pop() ?? timeZone;
  return `${city.replace(/_/g, " ")} time`;
}

/** "just now", "12 s ago", "5 min ago", "3 h ago", "2 d ago" */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return "just now";
  if (s < 60) return `${s}${NBSP}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${NBSP}min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}${NBSP}h ago`;
  return `${Math.floor(h / 24)}${NBSP}d ago`;
}

/** "45 s", "12 min", "2 h 13 min", "3 d 4 h" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}${NBSP}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${NBSP}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}${NBSP}h ${m % 60}${NBSP}min` : `${h}${NBSP}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}${NBSP}d ${h % 24}${NBSP}h` : `${d}${NBSP}d`;
}

/** One-decimal number with a typographic minus: "14.2", "−3.5". */
export function formatNumber(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return Number(fixed) === 0 ? (0).toFixed(digits) : fixed.replace("-", "−");
}

/** Signed delta: "+0.4", "−1.2", "0.0". */
export function formatSigned(value: number, digits = 1): string {
  const text = formatNumber(value, digits);
  return value > 0 && Number(value.toFixed(digits)) !== 0 ? `+${text}` : text;
}

export const formatTemp = (c: number) => `${formatNumber(c)}${NBSP}°C`;
export const formatRh = (pct: number) => `${formatNumber(pct)}%`;
