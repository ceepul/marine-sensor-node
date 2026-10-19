import { describe, expect, it } from "vitest";
import { describeWeather, parseForecast } from "./open-meteo";

// Trimmed from a real timeformat=unixtime response.
const response = {
  latitude: 41.522335,
  longitude: -70.68138,
  timezone: "America/New_York",
  current: {
    time: 1792374300,
    interval: 900,
    temperature_2m: 7.7,
    relative_humidity_2m: 64,
    dew_point_2m: 1.3,
    weather_code: 0,
    cloud_cover: 0,
    wind_speed_10m: 10.2,
    is_day: 0,
  },
  hourly: {
    time: [1792371600, 1792375200, 1792378800],
    temperature_2m: [8.1, 7.4, null],
    relative_humidity_2m: [61, 64, 70],
    dew_point_2m: [1.0, 1.1, 1.4],
    cloud_cover: [0, 5, 20],
    precipitation_probability: [0, 0, 0],
    weather_code: [0, 0, 1],
  },
};

describe("parseForecast", () => {
  it("parses current conditions and hourly forecast", () => {
    const snapshot = parseForecast(response, 1792374400);
    expect(snapshot.fetchedAt).toBe(1792374400);
    expect(snapshot.current).toEqual({
      t: 1792374300,
      tempC: 7.7,
      rhPct: 64,
      dewPointC: 1.3,
      weatherCode: 0,
      cloudCover: 0,
      windKph: 10.2,
      isDay: false,
    });
    expect(snapshot.hourly.map((h) => h.tempC)).toEqual([8.1, 7.4]); // the hour without a temperature is dropped
  });

  it("tolerates missing current conditions", () => {
    expect(parseForecast({ ...response, current: undefined }, 0).current).toBeNull();
  });

  it("rejects a response with no forecast", () => {
    expect(() => parseForecast({ error: true, reason: "Invalid latitude" }, 0)).toThrow();
    expect(() => parseForecast({ hourly: { time: [] } }, 0)).toThrow();
  });
});

describe("describeWeather", () => {
  it("maps WMO codes", () => {
    expect(describeWeather(0).label).toBe("Clear sky");
    expect(describeWeather(63)).toEqual({ label: "Rain", icon: "rain" });
    expect(describeWeather(96).icon).toBe("storm");
  });
});
