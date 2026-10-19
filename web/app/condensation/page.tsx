import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AwaitingData } from "@/components/awaiting-data";
import { CondensationLive } from "@/components/condensation/condensation-live";
import { CondensationSkeleton } from "@/components/skeletons";
import { getCondensation, resolveDevice } from "@/lib/queries";

export const metadata: Metadata = { title: "Condensation risk" };

export default function CondensationPage({ searchParams }: PageProps<"/condensation">) {
  return (
    <Suspense fallback={<CondensationSkeleton />}>
      <Condensation searchParams={searchParams} />
    </Suspense>
  );
}

async function Condensation({ searchParams }: Pick<PageProps<"/condensation">, "searchParams">) {
  await connection(); // live data: always render at request time
  const { device } = await searchParams;
  const resolved = await resolveDevice(typeof device === "string" ? device : undefined);
  if (!resolved) return <AwaitingData title="Condensation risk" />;

  const state = await getCondensation(resolved.deviceId);
  return <CondensationLive key={resolved.deviceId} devices={resolved.devices} initial={state} />;
}
