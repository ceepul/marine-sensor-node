import { CircleCheck, CircleDashed, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

export const TONE_ICONS: Record<Tone, LucideIcon> = {
  good: CircleCheck,
  warning: TriangleAlert,
  critical: CircleX,
  neutral: CircleDashed,
};

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(15_23_42/0.04)]", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <div className="mt-1 text-sm text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function StatusPill({ tone, label, size = "sm" }: { tone: Tone; label: string; size?: "sm" | "md" }) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={cn(
        `tone-${tone} inline-flex shrink-0 items-center gap-1.5 rounded-full bg-(--tone-wash) font-medium whitespace-nowrap text-ink`,
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
      )}
    >
      <Icon className={cn("text-(--tone-ink)", size === "sm" ? "size-3.5" : "size-4")} aria-hidden />
      {label}
    </span>
  );
}

/** Two-column label/value rows. */
export function Facts({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-3">{label}</dt>
          <dd className="text-right text-ink tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A row of toggle buttons; one is always selected. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            o.value === value ? "bg-surface text-ink shadow-[0_1px_2px_rgb(15_23_42/0.08)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

/** Tinted notice used for status explanations and the condensation warning. */
export function Notice({ tone, title, children, action }: { tone: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = TONE_ICONS[tone];
  return (
    <div className={`tone-${tone} flex gap-3 rounded-lg bg-(--tone-wash) px-3.5 py-3 text-sm`}>
      <Icon className="mt-0.5 size-4 shrink-0 text-(--tone-ink)" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={cn("text-ink-2", title != null && "mt-0.5")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
