import { describe, expect, it } from "vitest";
import { assessCondensation, describeRisk, type TempPoint } from "./condensation";

const NOW = Date.UTC(2026, 9, 19, 16, 0) / 1000; // 12:00 in New York
const TZ = "America/New_York";
const hour = (h: number, tempC: number): TempPoint => ({ t: NOW + h * 3600, tempC });

describe("assessCondensation", () => {
  it("is low when the forecast stays well above the dew point", () => {
    const a = assessCondensation({ dewPointC: 5, outsideNow: hour(0, 15), forecast: [hour(6, 11), hour(12, 10), hour(18, 13)], now: NOW })!;
    expect(a.level).toBe("low");
    expect(a.low).toEqual(hour(12, 10));
    expect(a.marginC).toBeCloseTo(5);
    expect(a.firstBelow).toBeNull();
  });

  it("is elevated when the forecast comes within the caution margin", () => {
    const a = assessCondensation({ dewPointC: 8, outsideNow: hour(0, 15), forecast: [hour(10, 12), hour(14, 10)], now: NOW })!;
    expect(a.level).toBe("elevated");
    expect(a.firstCaution).toEqual(hour(14, 10));
    expect(a.firstBelow).toBeNull();
  });

  it("is high when the forecast drops below the dew point", () => {
    const a = assessCondensation({ dewPointC: 9, outsideNow: hour(0, 14), forecast: [hour(3, 11), hour(6, 8.5), hour(9, 7)], now: NOW })!;
    expect(a.level).toBe("high");
    expect(a.firstBelow).toEqual(hour(6, 8.5));
    expect(a.low).toEqual(hour(9, 7));
    expect(a.marginC).toBeCloseTo(-2);
  });

  it("treats a reading exactly at the dew point as condensing", () => {
    const a = assessCondensation({ dewPointC: 9, outsideNow: null, forecast: [hour(2, 9)], now: NOW })!;
    expect(a.level).toBe("high");
  });

  it("only looks 48 hours ahead and ignores past hours", () => {
    const a = assessCondensation({ dewPointC: 9, outsideNow: null, forecast: [hour(-2, 0), hour(12, 15), hour(49, 0)], now: NOW })!;
    expect(a.level).toBe("low");
    expect(a.low).toEqual(hour(12, 15));
  });

  it("returns null with no usable weather", () => {
    expect(assessCondensation({ dewPointC: 9, outsideNow: null, forecast: [], now: NOW })).toBeNull();
  });
});

describe("describeRisk", () => {
  it("flags condensation happening now", () => {
    const a = assessCondensation({ dewPointC: 9, outsideNow: hour(0, 8), forecast: [], now: NOW })!;
    expect(describeRisk(a, TZ, NOW).title).toBe("Condensation likely now");
  });

  it("says when condensation will start", () => {
    const a = assessCondensation({ dewPointC: 9, outsideNow: hour(0, 14), forecast: [hour(6, 8.5)], now: NOW })!;
    const text = describeRisk(a, TZ, NOW);
    expect(text.title).toBe("Condensation expected in about 6 h");
    expect(text.detail).toContain("today 18:00");
    expect(text.detail).toContain("9.0 °C");
  });

  it("explains the margin when risk is low", () => {
    const a = assessCondensation({ dewPointC: 5, outsideNow: hour(0, 15), forecast: [hour(16, 10)], now: NOW })!;
    const text = describeRisk(a, TZ, NOW);
    expect(text.title).toBe("Low condensation risk");
    expect(text.detail).toContain("tomorrow 04:00");
    expect(text.detail).toContain("stays 5.0 °C above");
  });
});
