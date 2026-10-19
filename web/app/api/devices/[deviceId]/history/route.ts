import { connection, type NextRequest } from "next/server";
import { DEFAULT_RANGE, isRangeKey, RANGE_KEYS } from "@/lib/history";
import { getHistory } from "@/lib/queries";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/devices/[deviceId]/history">) {
  await connection();
  const { deviceId } = await ctx.params;
  const range = request.nextUrl.searchParams.get("range") ?? DEFAULT_RANGE;
  if (!isRangeKey(range)) {
    return Response.json({ error: `range must be one of: ${RANGE_KEYS.join(", ")}` }, { status: 400 });
  }
  return Response.json(await getHistory(deviceId, range), { headers: { "Cache-Control": "no-store" } });
}
