import { describe, expect, it } from "vitest";
import { nodeStatus, sensorStatus, type SensorInputs } from "./status";

const NOW = 1_800_000_000;

describe("nodeStatus", () => {
  it("follows the uploader's heartbeat", () => {
    expect(nodeStatus(null, NOW)).toBe("never");
    expect(nodeStatus(NOW - 45, NOW)).toBe("online");
    expect(nodeStatus(NOW - 180, NOW)).toBe("online");
    expect(nodeStatus(NOW - 181, NOW)).toBe("delayed");
    expect(nodeStatus(NOW - 601, NOW)).toBe("offline");
  });
});

describe("sensorStatus", () => {
  const base: SensorInputs = {
    node: "online",
    lastStateEvent: { kind: "ok", ts: NOW - 3600 },
    lastLoggerStart: NOW - 3630,
    lastReadingAt: NOW - 20,
    now: NOW,
  };

  it("is ok while readings arrive", () => {
    expect(sensorStatus(base)).toEqual({ status: "ok", since: NOW - 3600 });
  });

  it("reports the logger's fault states", () => {
    expect(sensorStatus({ ...base, lastStateEvent: { kind: "sensor_silent", ts: NOW - 90 } })).toEqual({
      status: "sensor_silent",
      since: NOW - 90,
    });
    expect(sensorStatus({ ...base, lastStateEvent: { kind: "port_missing", ts: NOW - 90 } }).status).toBe("port_missing");
  });

  it("is starting after a logger restart until the first state event", () => {
    expect(sensorStatus({ ...base, lastLoggerStart: NOW - 10 })).toEqual({ status: "starting", since: NOW - 10 });
  });

  it("is stalled when readings stop while the node is online", () => {
    expect(sensorStatus({ ...base, lastReadingAt: NOW - 600 }).status).toBe("stalled");
  });

  it("can't be judged while the node is unreachable", () => {
    expect(sensorStatus({ ...base, node: "offline" }).status).toBe("unknown");
    expect(sensorStatus({ ...base, node: "delayed" }).status).toBe("unknown");
    expect(sensorStatus({ ...base, node: "never" }).status).toBe("no_data");
  });
});
