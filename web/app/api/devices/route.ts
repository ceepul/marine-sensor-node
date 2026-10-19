import { connection } from "next/server";
import { listDevices, nowSeconds } from "@/lib/queries";
import { nodeStatus } from "@/lib/status";

export async function GET() {
  await connection();
  const now = nowSeconds();
  const devices = (await listDevices()).map((d) => ({ ...d, status: nodeStatus(d.lastSeenAt, now) }));
  return Response.json({ now, devices }, { headers: { "Cache-Control": "no-store" } });
}
