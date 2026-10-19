import { Waves } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavList } from "./nav-links";
import { SidebarStatus, SidebarStatusPlaceholder } from "./sidebar-status";

export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col border-r border-border bg-surface md:w-60">
      <Link href="/" className="flex h-16 items-center gap-3 px-4 md:px-5" aria-label="Marine Sensor home">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
          <Waves className="size-4.5" aria-hidden />
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block text-sm leading-tight font-semibold text-ink">Marine Sensor</span>
          <span className="block text-xs text-ink-3">Node monitor</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex-1 px-3 py-3">
        {/* The device query param is only known per request; the fallback links omit it. */}
        <Suspense fallback={<NavList device={null} />}>
          <NavLinks />
        </Suspense>
      </nav>

      <div className="border-t border-border px-3 py-3">
        <p className="hidden px-2.5 pb-1 text-xs font-medium text-ink-3 md:block">Status</p>
        <Suspense fallback={<SidebarStatusPlaceholder />}>
          <SidebarStatus />
        </Suspense>
      </div>
    </aside>
  );
}
