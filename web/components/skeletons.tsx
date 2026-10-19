import { Card, PageHeader, Skeleton } from "./ui";

// Fallbacks ship in the prerendered static shell while live data streams in.

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <PageHeader title="Dashboard" description={<Skeleton className="h-5 w-56" />} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="h-93 rounded-xl border border-border bg-[#0b0f14]" />
      <Card className="h-140 p-5">
        <Skeleton className="h-full" />
      </Card>
    </div>
  );
}

export function CondensationSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <PageHeader title="Condensation risk" description={<Skeleton className="h-5 w-72" />} />
      <Card className="p-6">
        <Skeleton className="h-16" />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-36" />
          </Card>
        ))}
      </div>
      <Card className="h-105 p-5">
        <Skeleton className="h-full" />
      </Card>
    </div>
  );
}
