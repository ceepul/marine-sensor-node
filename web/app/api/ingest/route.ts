import { createHash, timingSafeEqual } from "node:crypto";
import { recordUpload } from "@/lib/ingest";
import { parseUpload } from "@/lib/payload";

// Receives batches from sensor/uploader.py. The uploader only marks rows as sent
// after a 2xx, so anything else (including a 500 here) means "keep it, retry later".

const MAX_BODY_BYTES = 1_000_000; // a full 200-row batch is ~20 KB

let warnedOpen = false;

function unauthorized(request: Request): Response | null {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "INGEST_TOKEN is not configured on the server." }, { status: 503 });
    }
    if (!warnedOpen) {
      console.warn("INGEST_TOKEN is not set: accepting unauthenticated uploads (development only).");
      warnedOpen = true;
    }
    return null;
  }
  const given = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1].trim() ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest(); // equal lengths for timingSafeEqual
  if (timingSafeEqual(digest(given), digest(expected))) return null;
  return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
}

export async function POST(request: Request) {
  const denied = unauthorized(request);
  if (denied) return denied;

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseUpload(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await recordUpload(parsed.upload, Date.now() / 1000);
    return Response.json({ ok: true, deviceId: parsed.upload.deviceId, ...result });
  } catch (err) {
    console.error("Ingest failed:", err);
    return Response.json({ error: "Could not store the upload. It will be retried." }, { status: 500 });
  }
}
