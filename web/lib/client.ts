import { useSyncExternalStore } from "react";
import type { RangeKey } from "./history";

// API keys double as SWR cache keys, so the server-rendered initial data and the
// browser's polling share one identity.
const device = (id: string) => `/api/devices/${encodeURIComponent(id)}`;
export const apiKeys = {
  summary: (id: string) => `${device(id)}/summary`,
  history: (id: string, range: RangeKey) => `${device(id)}/history?range=${range}`,
  condensation: (id: string) => `${device(id)}/condensation`,
};

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

// One shared one-second ticker for every component that shows relative times.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onTick: () => void) {
  listeners.add(onTick);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const clientNow = () => Math.floor(Date.now() / 1000);

/**
 * The current time in seconds, updated every second. During SSR and hydration it
 * returns `serverNow`, so "12 s ago" renders identically on both sides.
 */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(subscribe, clientNow, () => serverNow);
}
