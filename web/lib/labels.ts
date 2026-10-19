import type { RiskLevel } from "./condensation";
import { formatDuration } from "./format";
import type { NodeStatus, SensorStatus } from "./status";

export type Tone = "good" | "warning" | "critical" | "neutral";
type Label = { label: string; tone: Tone };

export const NODE_LABELS: Record<NodeStatus, Label> = {
  online: { label: "Online", tone: "good" },
  offline: { label: "Offline", tone: "critical" },
  never: { label: "Waiting", tone: "neutral" },
};

export const SENSOR_LABELS: Record<SensorStatus, Label> = {
  ok: { label: "Reporting", tone: "good" },
  starting: { label: "Starting", tone: "neutral" },
  port_missing: { label: "Adapter missing", tone: "critical" },
  sensor_silent: { label: "Not responding", tone: "critical" },
  stalled: { label: "Stalled", tone: "warning" },
  unknown: { label: "Unknown", tone: "neutral" },
  no_data: { label: "No data", tone: "neutral" },
};

export const RISK_LABELS: Record<RiskLevel, Label> = {
  low: { label: "Low risk", tone: "good" },
  elevated: { label: "Elevated risk", tone: "warning" },
  high: { label: "High risk", tone: "critical" },
};

/** How an event reads in the live log. */
export function eventLabel(kind: string, detail: string | null): Label {
  switch (kind) {
    case "logger_started":
      return { label: "Logger started", tone: "neutral" };
    case "ok":
      return { label: "Sensor reporting", tone: "good" };
    case "port_missing":
      return { label: "RS-485 adapter missing", tone: "critical" };
    case "sensor_silent":
      return { label: "Sensor not responding", tone: "critical" };
    case "node_connected":
      return { label: "Node connected for the first time", tone: "neutral" };
    case "node_reconnected": {
      const offline = Number(detail);
      return { label: Number.isFinite(offline) ? `Node back online after ${formatDuration(offline)}` : "Node back online", tone: "good" };
    }
    default:
      return { label: detail ? `${kind}: ${detail}` : kind, tone: "neutral" };
  }
}
