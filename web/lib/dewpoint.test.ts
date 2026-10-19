import { describe, expect, it } from "vitest";
import { dewPoint, relativeHumidity } from "./dewpoint";

describe("dewPoint", () => {
  it("matches reference values", () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.26, 1);
    expect(dewPoint(25, 60)).toBeCloseTo(16.7, 1);
    expect(dewPoint(0, 80)).toBeCloseTo(-3.04, 1);
  });

  it("equals the air temperature when saturated", () => {
    expect(dewPoint(12.3, 100)).toBeCloseTo(12.3, 6);
  });

  it("stays finite at 0 %RH", () => {
    expect(Number.isFinite(dewPoint(20, 0))).toBe(true);
  });
});

describe("relativeHumidity", () => {
  it("inverts dewPoint", () => {
    expect(relativeHumidity(18, dewPoint(18, 72.5))).toBeCloseTo(72.5, 6);
  });

  it("caps at 100 %", () => {
    expect(relativeHumidity(5, 9)).toBe(100);
  });
});
