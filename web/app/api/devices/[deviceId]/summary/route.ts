import { connection } from "next/server";
import { getSummary } from "@/lib/queries";
import { parseSummaryQuery } from "@/lib/summary";

// ?after=<reading id>.<event id> returns only newer log entries; &stats=1 adds the slow stats.
export async function GET(request: Request, ctx: RouteContext<"/api/devices/[deviceId]/summary">) {
  await connection();
  const { deviceId } = await ctx.params;
  const summary = await getSummary(deviceId, parseSummaryQuery(new URL(request.url).searchParams));
  if (!summary) return Response.json({ error: `No data from device "${deviceId}" yet.` }, { status: 404 });
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
