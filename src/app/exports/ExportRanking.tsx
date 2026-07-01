import Link from "next/link";
import type { ExportRankingResponse, ExportMetric } from "@/lib/exports";
import { formatExportUsd } from "@/lib/exports";

const METRIC_LABEL: Record<ExportMetric, string> = {
  export: "수출",
  import: "수입",
  balance: "무역수지",
};

function yoyBadge(yoy: number | null) {
  if (yoy === null) return <span className="text-xs text-gray-400">—</span>;
  const up = yoy >= 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-green-600" : "text-red-600"}`}>
      {up ? "+" : ""}
      {yoy.toFixed(1)}%
    </span>
  );
}

export default function ExportRanking({
  data,
  from,
  to,
  metric,
}: {
  data: ExportRankingResponse;
  from: string;
  to: string;
  metric: string;
}) {
  const { rows, coverage, ym } = data;
  const label = METRIC_LABEL[data.metric];
  const maxValue = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.value))) : 1;

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      aria-label={`${ym} 품목 ${label} 랭킹`}
    >
      <div className="px-4 pt-4 pb-2 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">
          {ym} 품목 {label} 랭킹
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {coverage.provisional ? "잠정 · " : ""}
          {coverage.coveredItems}/{coverage.totalItems} 품목
          {coverage.coveragePct !== null ? ` · 총수출의 ${coverage.coveragePct}%` : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">해당 월 데이터가 없습니다.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => {
            const pct = Math.max(2, (Math.abs(r.value) / maxValue) * 100);
            const href = `/exports?item=${r.itemCode}&from=${from}&to=${to}&metric=${metric}`;
            return (
              <li key={r.itemCode} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-xs font-semibold text-gray-400 tabular-nums">{r.rank}</span>
                  <Link
                    href={href}
                    className="w-24 shrink-0 text-sm font-medium text-gray-700 hover:text-blue-600 truncate"
                  >
                    {r.itemName}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div
                      className="h-4 rounded bg-blue-500/80"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </div>
                  <span className="w-20 text-right text-sm tabular-nums text-gray-800">
                    {formatExportUsd(r.value)}
                  </span>
                  <span className="w-16 text-right">{yoyBadge(r.yoyPct)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
