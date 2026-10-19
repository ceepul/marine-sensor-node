"use client";

import { useEffect, useRef } from "react";
import { useNow } from "@/lib/client";
import { formatClock, formatDate, formatDuration } from "@/lib/format";
import type { LogEntry } from "@/lib/types";
import { cn } from "../ui";

const HIGHLIGHT_S = 15; // a little longer than the poll interval
const FAULTS = new Set(["port_missing", "sensor_silent"]);

/** Terminal-style feed of the rows the node uploaded, oldest at the top, following new lines. */
export function LiveLog({
  log,
  deviceId,
  timeZone,
  serverNow,
}: {
  log: LogEntry[];
  deviceId: string;
  timeZone: string;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const lines = [...log].reverse();
  const today = formatDate(now, timeZone);

  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true); // stays true unless the reader scrolls up
  const newest = lines.at(-1)?.key;
  useEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [newest]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-[#0b0f14] shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 font-mono text-xs text-[#8b98a8]">
        <span>
          <span className="text-[#4ade80]">$</span> tail -f uploads <span className="text-[#d6dde6]">{deviceId}</span>
        </span>
        <span className="font-sans">Live log</span>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        role="log"
        aria-label="Rows received from the sensor node"
        className="h-80 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-6 whitespace-pre text-[#d6dde6]"
      >
        {lines.length === 0 && <div className="text-[#8b98a8]">waiting for the first upload…</div>}
        {lines.map((entry) => {
          const day = formatDate(entry.ts, timeZone);
          return (
            <div key={entry.key} className={cn("-mx-4 px-4", now - entry.receivedAt < HIGHLIGHT_S && "row-new")}>
              <span className="text-[#6b7785]">
                {day !== today && `${day} `}
                {formatClock(entry.ts, timeZone, true)}
              </span>
              {"  "}
              <Line entry={entry} />
            </div>
          );
        })}
        <div aria-hidden>
          <span className="cursor-blink text-[#8b98a8]">▍</span>
        </div>
      </div>
    </section>
  );
}

function Line({ entry }: { entry: LogEntry }) {
  if (entry.type === "reading") {
    return (
      <>
        <span className="text-[#5fb3f9]">reading</span>
        {"  "}
        <Field k="id" v={entry.sourceId} />
        <Field k="temp_c" v={entry.tempC} />
        <Field k="rh_pct" v={entry.rhPct} />
        <Field k="clock_ok" v={entry.clockOk ? 1 : 0} warn={!entry.clockOk} />
      </>
    );
  }
  if (entry.sourceId == null) {
    // Recorded by the server, not sent by the node.
    return (
      <>
        <span className="text-[#c4a7e7]">server</span>
        {"   "}
        {entry.kind}
        {entry.kind === "node_reconnected" && entry.detail && (
          <span className="text-[#8b98a8]">{`  offline for ${formatDuration(Number(entry.detail))}`}</span>
        )}
      </>
    );
  }
  const color = FAULTS.has(entry.kind) ? "text-[#f87171]" : entry.kind === "ok" ? "text-[#4ade80]" : "text-[#e5c07b]";
  return (
    <>
      <span className="text-[#e5c07b]">event</span>
      {"    "}
      <Field k="id" v={entry.sourceId} />
      <span className="text-[#8b98a8]">kind=</span>
      <span className={color}>{entry.kind}</span>
      {entry.detail && <span className="text-[#8b98a8]">{`  detail=${JSON.stringify(entry.detail)}`}</span>}
    </>
  );
}

function Field({ k, v, warn }: { k: string; v: number; warn?: boolean }) {
  return (
    <>
      <span className="text-[#8b98a8]">{k}=</span>
      <span className={warn ? "text-[#e5c07b]" : undefined}>{v}</span>
      {"  "}
    </>
  );
}
