/**
 * Round axis bounds and ticks around `values`: the smallest 1/2/5 step that fits in
 * `maxTicks`, so the data fills as much of the plot as possible. `minSpan` keeps a
 * steady signal from being zoomed until sensor noise looks dramatic.
 */
export function niceScale(
  values: number[],
  { minSpan, clamp, maxTicks = 7 }: { minSpan: number; clamp?: [number, number]; maxTicks?: number },
): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter(Number.isFinite);
  const dataLo = finite.length ? Math.min(...finite) : 0;
  const dataHi = finite.length ? Math.max(...finite) : minSpan;
  const span = Math.max(dataHi - dataLo, minSpan);
  const mid = (dataLo + dataHi) / 2;
  const [padLo, padHi] = [mid - span * 0.6, mid + span * 0.6]; // 10% headroom each side

  const magnitude = 10 ** Math.floor(Math.log10(span / maxTicks));
  for (const step of [1, 2, 5, 10, 20, 50, 100].map((s) => s * magnitude)) {
    let lo = Math.floor(padLo / step) * step;
    let hi = Math.ceil(padHi / step) * step;
    if (clamp) [lo, hi] = [Math.max(lo, clamp[0]), Math.min(hi, clamp[1])];
    if (Math.round((hi - lo) / step) + 1 > maxTicks) continue;

    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step / 1e6; v += step) ticks.push(Number(v.toFixed(6)));
    return { domain: [lo, hi], ticks };
  }
  return { domain: [padLo, padHi], ticks: [] }; // unreachable: the largest step always fits
}
