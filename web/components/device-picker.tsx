"use client";

import { ChevronsUpDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { DeviceListItem } from "@/lib/types";

/** Only rendered when more than one node has reported. */
export function DevicePicker({ devices, value }: { devices: DeviceListItem[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (devices.length < 2) return null;

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Sensor node</span>
      <select
        value={value}
        onChange={(e) => router.push(`${pathname}?device=${encodeURIComponent(e.target.value)}`)}
        className="appearance-none rounded-lg border border-border bg-surface py-1.5 pr-8 pl-3 font-mono text-xs text-ink hover:border-border-strong"
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.id}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2.5 size-3.5 text-ink-3" aria-hidden />
    </label>
  );
}
