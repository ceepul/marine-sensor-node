// Open-Meteo forecast API: free, no key, CC BY 4.0 (attribution shown on the page).
// https://open-meteo.com/en/docs

import type { WeatherHour, WeatherSnapshot } from "./types";

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export function forecastQuery(latitude: number, longitude: number): URLSearchParams {
  return new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,dew_point_2m,weather_code,cloud_cover,wind_speed_10m,is_day",
    hourly: "temperature_2m,relative_humidity_2m,dew_point_2m,cloud_cover,precipitation_probability,weather_code",
    forecast_days: "3", // starts at local midnight, so 3 days always covers the next 48 h
    timezone: "auto",
    timeformat: "unixtime", // absolute timestamps: no zone parsing
  });
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const column = (hourly: Json, name: string): unknown[] => (Array.isArray(hourly[name]) ? (hourly[name] as unknown[]) : []);

export function parseForecast(json: unknown, fetchedAt: number): WeatherSnapshot {
  if (!isObject(json) || !isObject(json.hourly)) throw new Error("Unexpected Open-Meteo response");

  const h = json.hourly;
  const hourly: WeatherHour[] = [];
  column(h, "time").forEach((time, i) => {
    const t = num(time);
    const tempC = num(column(h, "temperature_2m")[i]);
    if (t == null || tempC == null) return;
    hourly.push({
      t,
      tempC,
      rhPct: num(column(h, "relative_humidity_2m")[i]),
      dewPointC: num(column(h, "dew_point_2m")[i]),
      cloudCover: num(column(h, "cloud_cover")[i]),
      precipProbability: num(column(h, "precipitation_probability")[i]),
      weatherCode: num(column(h, "weather_code")[i]),
    });
  });
  if (hourly.length === 0) throw new Error("Open-Meteo returned no hourly forecast");

  const c = isObject(json.current) ? json.current : {};
  const current = {
    t: num(c.time),
    tempC: num(c.temperature_2m),
    rhPct: num(c.relative_humidity_2m),
    dewPointC: num(c.dew_point_2m),
    weatherCode: num(c.weather_code),
    cloudCover: num(c.cloud_cover),
    windKph: num(c.wind_speed_10m),
    isDay: num(c.is_day),
  };
  const complete = Object.values(current).every((v) => v != null);

  return {
    fetchedAt,
    latitude: num(json.latitude) ?? NaN,
    longitude: num(json.longitude) ?? NaN,
    current: complete
      ? {
          t: current.t!,
          tempC: current.tempC!,
          rhPct: current.rhPct!,
          dewPointC: current.dewPointC!,
          weatherCode: current.weatherCode!,
          cloudCover: current.cloudCover!,
          windKph: current.windKph!,
          isDay: current.isDay === 1,
        }
      : null,
    hourly,
  };
}

export type WeatherIcon = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO weather interpretation codes, as used by Open-Meteo. */
export function describeWeather(code: number | null): { label: string; icon: WeatherIcon } {
  if (code == null) return { label: "Unknown", icon: "cloudy" };
  if (code === 0) return { label: "Clear sky", icon: "clear" };
  if (code === 1) return { label: "Mainly clear", icon: "partly" };
  if (code === 2) return { label: "Partly cloudy", icon: "partly" };
  if (code === 3) return { label: "Overcast", icon: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: code >= 56 ? "Freezing drizzle" : "Drizzle", icon: "drizzle" };
  if (code >= 61 && code <= 67) return { label: code >= 66 ? "Freezing rain" : "Rain", icon: "rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "snow" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", icon: "rain" };
  if (code === 85 || code === 86) return { label: "Snow showers", icon: "snow" };
  if (code >= 95) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Unknown", icon: "cloudy" };
}
