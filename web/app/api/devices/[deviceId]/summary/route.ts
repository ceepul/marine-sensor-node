import { connection } from "next/server";
import { getSummary } from "@/lib/queries";

export async function GET(_request: Request, ctx: RouteContext<"/api/devices/[deviceId]/summary">) {
  await connection();
  const { deviceId } = await ctx.params;
  const summary = await getSummary(deviceId);
  if (!summary) return Response.json({ error: `No data from device "${deviceId}" yet.` }, { status: 404 });
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
