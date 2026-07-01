import type { ExportSeriesResponse, ExportMetric } from "@/lib/exports";
import { formatExportUsd } from "@/lib/exports";

const METRIC_LABEL: Record<ExportMetric, string> = {
  export: "수출",
  import: "수입",
  balance: "무역수지",
};

function StatCard({
  title,
  value,
  sub,
  valueColor,
  badge,
}: {
  title: string;
  value: string;
  sub?: string;
  valueColor?: string;
  badge?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueColor ?? "text-gray-900"}`}>{value}</p>
      <div className="flex items-center gap-1.5">
        {sub && <p className="text-xs text-gray-400 leading-snug">{sub}</p>}
        {badge && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function pctStr(v: number | null): string {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

export default function ExportSummaryCards({ data }: { data: ExportSeriesResponse }) {
  const { rows, summary, metric } = data;
  const label = METRIC_LABEL[metric];

  // 기간 평균 (월 metric 값 평균)
  const avg =
    rows.length > 0 ? rows.reduce((acc, r) => acc + r.value, 0) / rows.length : null;

  const provisionalBadge = summary.latestProvisional ? "잠정" : undefined;

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <StatCard
        title={`최신월 ${label}`}
        value={formatExportUsd(summary.latestValue)}
        sub={summary.latestYm ?? undefined}
        badge={provisionalBadge}
      />
      <StatCard
        title="전년동월대비"
        value={pctStr(summary.latestYoyPct)}
        sub={summary.latestProvisional ? "잠정월 미표시" : "YoY"}
        valueColor={
          summary.latestYoyPct === null
            ? "text-gray-400"
            : summary.latestYoyPct >= 0
              ? "text-green-600"
              : "text-red-600"
        }
      />
      <StatCard title={`기간 평균 ${label}`} value={formatExportUsd(avg)} sub="월 평균" />
      <StatCard
        title="데이터 범위"
        value={summary.firstAvailable ?? "—"}
        sub={`~ ${summary.latestConfirmedYm ?? summary.latestYm ?? "—"} 확정`}
      />
    </div>
  );
}
