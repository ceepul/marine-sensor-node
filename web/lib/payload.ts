// Parses the body sensor/uploader.py posts:
//   {"device_id": str,
//    "readings": [{"id", "ts", "temp_c", "rh_pct", "clock_ok"}],
//    "events":   [{"id", "ts", "kind", "detail"}]}
//
// A bad row is skipped and counted, never fatal: the uploader retries a rejected
// batch forever, so one malformed row would otherwise wedge the whole queue.

export const MAX_ROWS_PER_REQUEST = 2000; // the uploader sends at most 200 of each

export type NodeReading = { sourceId: number; ts: number; tempC: number; rhPct: number; clockOk: boolean };
export type NodeEvent = { sourceId: number; ts: number; kind: string; detail: string | null };

export type Upload = {
  deviceId: string;
  readings: NodeReading[];
  events: NodeEvent[];
  invalid: { readings: number; events: number };
};

export type ParseResult = { ok: true; upload: Upload } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRowId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

export function parseUpload(body: unknown): ParseResult {
  if (!isObject(body)) return { ok: false, error: "Body must be a JSON object." };

  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  if (!deviceId || deviceId.length > 128) {
    return { ok: false, error: "device_id must be a non-empty string of at most 128 characters." };
  }

  const rawReadings = body.readings ?? [];
  const rawEvents = body.events ?? [];
  if (!Array.isArray(rawReadings) || !Array.isArray(rawEvents)) {
    return { ok: false, error: "readings and events must be arrays." };
  }
  if (rawReadings.length > MAX_ROWS_PER_REQUEST || rawEvents.length > MAX_ROWS_PER_REQUEST) {
    return { ok: false, error: `Send at most ${MAX_ROWS_PER_REQUEST} readings and ${MAX_ROWS_PER_REQUEST} events per request.` };
  }

  const readings = rawReadings.map(parseReading).filter((r): r is NodeReading => r !== null);
  const events = rawEvents.map(parseEvent).filter((e): e is NodeEvent => e !== null);
  return {
    ok: true,
    upload: {
      deviceId,
      readings,
      events,
      invalid: { readings: rawReadings.length - readings.length, events: rawEvents.length - events.length },
    },
  };
}

function parseReading(r: unknown): NodeReading | null {
  if (!isObject(r)) return null;
  const { id, ts, temp_c, rh_pct, clock_ok } = r;
  if (!isRowId(id) || !isNumber(ts) || ts < 0 || !isNumber(temp_c) || !isNumber(rh_pct)) return null;
  if (temp_c < -60 || temp_c > 100 || rh_pct < 0 || rh_pct > 100) return null; // physically impossible
  return { sourceId: id, ts, tempC: temp_c, rhPct: rh_pct, clockOk: clock_ok === 1 || clock_ok === true };
}

function parseEvent(e: unknown): NodeEvent | null {
  if (!isObject(e)) return null;
  const { id, ts, kind, detail } = e;
  if (!isRowId(id) || !isNumber(ts) || ts < 0 || typeof kind !== "string") return null;
  const name = kind.trim();
  if (!name || name.length > 64) return null;
  const text = detail == null ? null : typeof detail === "string" ? detail : JSON.stringify(detail);
  return { sourceId: id, ts, kind: name, detail: text?.slice(0, 1000) ?? null };
}
