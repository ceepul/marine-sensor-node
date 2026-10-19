import { connection } from "next/server";
import { getCondensation } from "@/lib/queries";

export async function GET(_request: Request, ctx: RouteContext<"/api/devices/[deviceId]/condensation">) {
  await connection();
  const { deviceId } = await ctx.params;
  return Response.json(await getCondensation(deviceId), { headers: { "Cache-Control": "no-store" } });
}
