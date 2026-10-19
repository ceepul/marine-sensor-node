import { describe, expect, it } from "vitest";
import { niceScale } from "./scale";

describe("niceScale", () => {
  it("rounds to clean ticks around the data", () => {
    expect(niceScale([8, 16.6], { minSpan: 4 })).toEqual({ domain: [6, 18], ticks: [6, 8, 10, 12, 14, 16, 18] });
  });

  it("widens the step rather than crowding ticks", () => {
    expect(niceScale([50, 55], { minSpan: 10 })).toEqual({ domain: [45, 60], ticks: [45, 50, 55, 60] });
  });

  it("keeps a minimum span for flat data", () => {
    const { domain } = niceScale([6.2, 6.3], { minSpan: 4 });
    expect(domain[1] - domain[0]).toBeGreaterThanOrEqual(4);
    expect(domain[0]).toBeLessThan(6.2);
    expect(domain[1]).toBeGreaterThan(6.3);
  });

  it("clamps to a physical range", () => {
    const { domain, ticks } = niceScale([88, 99.5], { minSpan: 10, clamp: [0, 100] });
    expect(domain[1]).toBe(100);
    expect(ticks.at(-1)).toBeLessThanOrEqual(100);
  });

  it("handles no data", () => {
    expect(niceScale([], { minSpan: 4 }).ticks.length).toBeGreaterThan(1);
  });
});
