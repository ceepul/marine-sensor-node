// Node and sensor health, derived from what the uploader sends. The uploader posts
// every ~5 s while readings flow and at least every 10 s as a heartbeat, so a
// quiet node is a dead (or disconnected) node.

export const READING_INTERVAL_S = 5; // logger INTERVAL on the node
export const NODE_OFFLINE_AFTER_S = 30; // three missed heartbeats
export const SENSOR_STALE_AFTER_S = 60;

export type NodeStatus = "online" | "offline" | "never";

export type SensorStatus =
  | "ok"
  | "starting"
  | "port_missing" // USB-RS485 converter missing (logger event)
  | "sensor_silent" // port fine, sensor not answering (logger event)
  | "stalled" // node online, but readings stopped
  | "unknown" // node not reachable, so the sensor can't be judged
  | "no_data";

/** Logger state events: the logger records one each time its state changes. */
export const SENSOR_STATE_KINDS = ["ok", "port_missing", "sensor_silent"] as const;

export function nodeStatus(lastSeenAt: number | null, now: number): NodeStatus {
  if (lastSeenAt == null) return "never";
  return now - lastSeenAt <= NODE_OFFLINE_AFTER_S ? "online" : "offline";
}

export type SensorInputs = {
  node: NodeStatus;
  lastStateEvent: { kind: string; ts: number } | null;
  lastLoggerStart: number | null;
  /** When the newest reading was taken (or received, if the node's clock wasn't synced). */
  lastReadingAt: number | null;
  now: number;
};

export function sensorStatus(i: SensorInputs): { status: SensorStatus; since: number | null } {
  if (i.node === "never") return { status: "no_data", since: null };
  if (i.node !== "online") return { status: "unknown", since: null };

  const state = i.lastStateEvent;
  if (i.lastLoggerStart != null && (state == null || i.lastLoggerStart > state.ts)) {
    return { status: "starting", since: i.lastLoggerStart };
  }
  if (state?.kind === "port_missing" || state?.kind === "sensor_silent") {
    return { status: state.kind, since: state.ts };
  }
  if (i.lastReadingAt == null) return { status: "no_data", since: null };
  if (i.now - i.lastReadingAt > SENSOR_STALE_AFTER_S) return { status: "stalled", since: i.lastReadingAt };
  return { status: "ok", since: state?.ts ?? null };
}
