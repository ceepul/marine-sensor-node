import { describe, expect, it } from "vitest";
import { parseUpload } from "./payload";

// Exactly what sensor/uploader.py posts: rows from Store.unsent() minus "uploaded".
const uploaderBody = {
  device_id: "marine-node-01",
  readings: [
    { id: 41, ts: 1792368000.123, temp_c: 22.3, rh_pct: 85.2, clock_ok: 1 },
    { id: 42, ts: 1792368030.118, temp_c: -5.0, rh_pct: 50.0, clock_ok: 0 },
  ],
  events: [{ id: 7, ts: 1792367999.5, kind: "logger_started", detail: null }],
};

describe("parseUpload", () => {
  it("parses the uploader's payload", () => {
    const result = parseUpload(uploaderBody);
    expect(result).toEqual({
      ok: true,
      upload: {
        deviceId: "marine-node-01",
        readings: [
          { sourceId: 41, ts: 1792368000.123, tempC: 22.3, rhPct: 85.2, clockOk: true },
          { sourceId: 42, ts: 1792368030.118, tempC: -5, rhPct: 50, clockOk: false },
        ],
        events: [{ sourceId: 7, ts: 1792367999.5, kind: "logger_started", detail: null }],
        invalid: { readings: 0, events: 0 },
      },
    });
  });

  it("accepts a heartbeat with no rows", () => {
    const result = parseUpload({ device_id: "pi", readings: [], events: [] });
    expect(result.ok && result.upload.readings).toEqual([]);
  });

  it("skips bad rows instead of rejecting the batch", () => {
    const result = parseUpload({
      device_id: "pi",
      readings: [
        uploaderBody.readings[0],
        { id: 43, ts: 1792368060, temp_c: "warm", rh_pct: 50, clock_ok: 1 },
        { id: 44, ts: 1792368090, temp_c: 21, rh_pct: 150, clock_ok: 1 },
        null,
      ],
      events: [{ id: 8, ts: 1792368000, kind: "" }, { id: 9, ts: 1792368000, kind: "ok", detail: { code: 3 } }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.upload.readings.map((r) => r.sourceId)).toEqual([41]);
    expect(result.upload.events).toEqual([{ sourceId: 9, ts: 1792368000, kind: "ok", detail: '{"code":3}' }]);
    expect(result.upload.invalid).toEqual({ readings: 3, events: 1 });
  });

  it("rejects requests it can't attribute to a device", () => {
    expect(parseUpload(null).ok).toBe(false);
    expect(parseUpload([]).ok).toBe(false);
    expect(parseUpload({ readings: [] }).ok).toBe(false);
    expect(parseUpload({ device_id: "   " }).ok).toBe(false);
    expect(parseUpload({ device_id: "pi", readings: {} }).ok).toBe(false);
  });
});
