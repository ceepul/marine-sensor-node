// Condensation risk for a sealed, watertight container.
//
// Sealed means the moisture inside is fixed, so the inside air keeps (roughly) the
// dew point the sensor measures now. Condensation forms on any surface colder than
// that dew point, and the coldest surfaces are the walls, which track the outside
// air. So: compare the outside air forecast against the inside dew point.
//
// The caution margin covers what that comparison leaves out: forecast error, walls
// cooling below air temperature on clear nights (radiative cooling), and sensor
// tolerance (about ±0.5 °C on the dew point).

import { formatDayTime, formatNumber, formatTemp } from "./format";

export const CAUTION_MARGIN_C = 3;
export const FORECAST_WINDOW_H = 48;

export type RiskLevel = "low" | "elevated" | "high";

export type TempPoint = { t: number; tempC: number };

export type Assessment = {
  level: RiskLevel;
  dewPointC: number;
  /** Coldest outside air in the window, current conditions included. */
  low: TempPoint;
  /** low - dew point: how close the coldest moment comes to condensing. */
  marginC: number;
  /** First moment outside air is at or below the dew point. */
  firstBelow: TempPoint | null;
  /** First moment outside air is within the caution margin. */
  firstCaution: TempPoint | null;
};

export function assessCondensation(input: {
  dewPointC: number;
  outsideNow: TempPoint | null;
  forecast: TempPoint[];
  now: number;
}): Assessment | null {
  const { dewPointC, now } = input;
  const end = now + FORECAST_WINDOW_H * 3600;
  const points = [
    ...(input.outsideNow ? [input.outsideNow] : []),
    ...input.forecast.filter((p) => p.t > now && p.t <= end),
  ].sort((a, b) => a.t - b.t);
  if (points.length === 0) return null;

  const low = points.reduce((min, p) => (p.tempC < min.tempC ? p : min));
  const firstBelow = points.find((p) => p.tempC <= dewPointC) ?? null;
  const firstCaution = points.find((p) => p.tempC <= dewPointC + CAUTION_MARGIN_C) ?? null;
  return {
    level: firstBelow ? "high" : firstCaution ? "elevated" : "low",
    dewPointC,
    low,
    marginC: low.tempC - dewPointC,
    firstBelow,
    firstCaution,
  };
}

/** Headline and one-sentence explanation, used by both the banner and the detail page. */
export function describeRisk(a: Assessment, timeZone: string, now: number): { title: string; detail: string } {
  const dew = formatTemp(a.dewPointC);
  const when = (t: number) => formatDayTime(t, timeZone, now);

  if (a.firstBelow) {
    const p = a.firstBelow;
    if (p.t <= now + 30 * 60) {
      return {
        title: "Condensation likely now",
        detail: `Outside air is ${formatTemp(p.tempC)}, at or below the container's dew point of ${dew}. Moisture will condense on the coldest inside surfaces.`,
      };
    }
    const hours = Math.round((p.t - now) / 3600);
    return {
      title: `Condensation expected ${hours < 1 ? "within the hour" : `in about ${hours} h`}`,
      detail: `Outside air is forecast to fall to ${formatTemp(p.tempC)} by ${when(p.t)}, below the container's dew point of ${dew}.`,
    };
  }
  if (a.firstCaution) {
    return {
      title: "Elevated condensation risk",
      detail: `The forecast low of ${formatTemp(a.low.tempC)} (${when(a.low.t)}) comes within ${formatNumber(a.marginC)} °C of the container's dew point of ${dew}.`,
    };
  }
  return {
    title: "Low condensation risk",
    detail: `The forecast low of ${formatTemp(a.low.tempC)} (${when(a.low.t)}) stays ${formatNumber(a.marginC)} °C above the container's dew point of ${dew}.`,
  };
}
