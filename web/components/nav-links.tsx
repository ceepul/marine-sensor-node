"use client";

import { Droplets, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "./ui";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/condensation", label: "Condensation", icon: Droplets },
];

/** Keeps the selected device (?device=) when switching pages. */
export function NavLinks() {
  return <NavList device={useSearchParams().get("device")} />;
}

export function NavList({ device }: { device: string | null }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <li key={href}>
            <Link
              href={device ? `${href}?device=${encodeURIComponent(device)}` : href}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors md:justify-start",
                active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className={cn("size-4.5 shrink-0", active ? "text-accent" : "text-ink-3")} aria-hidden />
              <span className="sr-only md:not-sr-only">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
