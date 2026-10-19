// Magnus formula with the Alduchov & Eskridge (1996) constants: within ~0.35 °C from -40 to 50 °C.
const A = 17.625;
const B = 243.04; // °C

/** Dew point (°C) of air at `tempC` and `rhPct` relative humidity. */
export function dewPoint(tempC: number, rhPct: number): number {
  const rh = Math.min(Math.max(rhPct, 0.1), 100); // 0 %RH has no dew point (ln 0)
  const gamma = Math.log(rh / 100) + (A * tempC) / (B + tempC);
  return (B * gamma) / (A - gamma);
}

/** Relative humidity (%) that air with dew point `dewPointC` has once it is at `tempC`. */
export function relativeHumidity(tempC: number, dewPointC: number): number {
  const rh = 100 * Math.exp((A * dewPointC) / (B + dewPointC) - (A * tempC) / (B + tempC));
  return Math.min(rh, 100);
}
