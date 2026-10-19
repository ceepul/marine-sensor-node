import { formatClock, formatDate } from "@/lib/format";
import { isLocalMidnight } from "@/lib/history";

export type TooltipRow = { label: string; color: string; value: string | null; dashed?: boolean };

/** One tooltip for every series at the hovered time: value first, then the series name. */
export function ChartTooltipCard({ title, rows, note }: { title: string; rows: TooltipRow[]; note?: string }) {
  return (
    <div className="min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[0_8px_24px_rgb(15_23_42/0.14)]">
      <p className="mb-1.5 font-medium text-ink-2">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <LineKey color={row.color} dashed={row.dashed} />
            <span className="font-semibold text-ink tabular">{row.value ?? "No data"}</span>
            <span className="text-ink-3">{row.label}</span>
          </div>
        ))}
      </div>
      {note && <p className="mt-1.5 border-t border-border pt-1.5 text-ink-3">{note}</p>}
    </div>
  );
}

/** A short stroke of the series colour: lines are keyed with lines, not boxes. */
export function LineKey({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <span className="w-3.5 shrink-0 border-t-2 border-dashed" style={{ borderColor: color }} aria-hidden />
  ) : (
    <span className="h-0.5 w-3.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LineKey color={item.color} dashed={item.dashed} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Axis label: the date at local midnight, the time otherwise. */
export function axisTimeLabel(t: number, timeZone: string): string {
  return isLocalMidnight(t, timeZone) ? formatDate(t, timeZone) : formatClock(t, timeZone);
}

export const axisTick = { fill: "var(--ink-3)", fontSize: 11 };

export const formatTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace("-", "−");
