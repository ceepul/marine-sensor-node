import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AwaitingData } from "@/components/awaiting-data";
import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { DashboardSkeleton } from "@/components/skeletons";
import { DEFAULT_RANGE } from "@/lib/history";
import { getFullSummary, getHistory, resolveDevice } from "@/lib/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection(); // live data: always render at request time
  const { device } = await searchParams;
  const resolved = await resolveDevice(typeof device === "string" ? device : undefined);
  if (!resolved) return <AwaitingData title="Dashboard" />;

  const [summary, history] = await Promise.all([
    getFullSummary(resolved.deviceId),
    getHistory(resolved.deviceId, DEFAULT_RANGE),
  ]);
  if (!summary) return <AwaitingData title="Dashboard" />;

  // Keyed by device so switching nodes starts fresh polling state.
  return <DashboardLive key={resolved.deviceId} devices={resolved.devices} initialSummary={summary} initialHistory={history} />;
}
