import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatClock,
  formatDateTime,
  formatDayTime,
  formatDuration,
  formatShortDateTime,
  formatSigned,
  formatTemp,
} from "./format";

const TZ = "America/New_York";
const t = Date.UTC(2026, 9, 19, 1, 15, 9) / 1000; // 21:15:09 on 18 Oct in New York (EDT)

describe("time formatting", () => {
  it("formats in the site's time zone", () => {
    expect(formatClock(t, TZ)).toBe("21:15");
    expect(formatClock(t, TZ, true)).toBe("21:15:09");
    expect(formatClock(t, "UTC")).toBe("01:15");
    expect(formatDateTime(t, TZ)).toBe("18 Oct 2026, 21:15");
    expect(formatShortDateTime(t, TZ)).toBe("Sun 18 Oct, 21:15");
  });

  it("names nearby days", () => {
    expect(formatDayTime(t + 3600, TZ, t)).toBe("today 22:15");
    expect(formatDayTime(t + 6 * 3600, TZ, t)).toBe("tomorrow 03:15");
    expect(formatDayTime(t + 3 * 86400, TZ, t)).toBe("Wed 21:15");
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(formatClock(t, "Mars/Olympus_Mons")).toBe("01:15");
  });
});

describe("durations", () => {
  it("reads naturally", () => {
    expect(formatAgo(2)).toBe("just now");
    expect(formatAgo(42)).toBe("42 s ago");
    expect(formatAgo(3 * 3600 + 5)).toBe("3 h ago");
    expect(formatDuration(2 * 3600 + 13 * 60)).toBe("2 h 13 min");
    expect(formatDuration(3 * 86400)).toBe("3 d");
  });
});

describe("numbers", () => {
  it("uses a typographic minus and never shows -0.0", () => {
    expect(formatTemp(-3.04)).toBe("−3.0 °C");
    expect(formatSigned(0.43)).toBe("+0.4");
    expect(formatSigned(-1.25)).toBe("−1.3");
    expect(formatSigned(-0.02)).toBe("0.0");
  });
});
