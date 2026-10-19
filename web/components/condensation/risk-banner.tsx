import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { describeRisk } from "@/lib/condensation";
import { RISK_LABELS } from "@/lib/labels";
import type { CondensationState } from "@/lib/types";
import { TONE_ICONS } from "../ui";

/** The condensation warning shown above the dashboard when risk is elevated or high. */
export function RiskBanner({ state }: { state: CondensationState }) {
  const a = state.assessment;
  if (!a || a.level === "low") return null;

  const { title, detail } = describeRisk(a, state.site.timeZone, state.now);
  const { tone } = RISK_LABELS[a.level];
  const Icon = TONE_ICONS[tone];
  return (
    <div
      role="status"
      className={`tone-${tone} flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--tone)_40%,transparent)] bg-(--tone-wash) px-4 py-3.5 sm:flex-row sm:items-center`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-(--tone-ink)" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-sm text-ink-2">{detail}</p>
        </div>
      </div>
      <Link
        href={`/condensation?device=${encodeURIComponent(state.deviceId)}`}
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgb(15_23_42/0.08)] hover:bg-surface-2 sm:self-auto"
      >
        View forecast
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
