import type { MonthlySummary } from "@/lib/monthly-returns";

function StatCard({
  title,
  value,
  sub,
  valueColor,
}: {
  title: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueColor ?? "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 leading-snug">{sub}</p>}
    </div>
  );
}

function pctStr(v: number | null, plus = true): string {
  if (v === null) return "—";
  return (plus && v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

export default function SummaryCards({
  summary,
}: {
  summary: MonthlySummary;
}) {
  const { cagrPct, bestMonth, worstMonth, positiveRatio, mdd } = summary;

  const hasMdd = mdd !== null;

  return (
    <div
      className={`grid gap-3 ${
        hasMdd
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          : "grid-cols-2 sm:grid-cols-4"
      }`}
    >
      <StatCard
        title="CAGR (연복리)"
        value={pctStr(cagrPct)}
        valueColor={
          cagrPct === null ? "text-gray-400" : cagrPct >= 0 ? "text-green-600" : "text-red-600"
        }
      />
      <StatCard
        title="최고 월"
        value={pctStr(bestMonth?.r ?? null)}
        sub={bestMonth?.ym ?? undefined}
        valueColor={
          bestMonth == null ? "text-gray-400" : bestMonth.r >= 0 ? "text-green-600" : "text-red-600"
        }
      />
      <StatCard
        title="최저 월"
        value={pctStr(worstMonth?.r ?? null)}
        sub={worstMonth?.ym ?? undefined}
        valueColor={
          worstMonth == null ? "text-gray-400" : worstMonth.r < 0 ? "text-red-600" : "text-green-600"
        }
      />
      <StatCard
        title="양봉 비율"
        value={positiveRatio !== null ? Math.round(positiveRatio * 100) + "%" : "—"}
        sub="상승 마감 월 비율"
      />
      {hasMdd && (
        <StatCard
          title="최대 낙폭 (MDD)"
          value={pctStr(mdd!.pct)}
          sub={`${mdd!.peak.slice(0, 7)} → ${mdd!.trough.slice(0, 7)}`}
          valueColor="text-red-600"
        />
      )}
    </div>
  );
}
