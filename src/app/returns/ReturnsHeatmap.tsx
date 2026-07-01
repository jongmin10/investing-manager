import type { MonthlyRow } from "@/lib/monthly-returns";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_KO = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

/** 발산형 컬러 스케일. ±15% 고정 기준. */
function cellColors(r: number | null): { bg: string; fg: string } {
  if (r === null) return { bg: "transparent", fg: "#9ca3af" };
  if (r === 0) return { bg: "#f3f4f6", fg: "#6b7280" };
  const intensity = Math.min(Math.abs(r) / 15, 1);
  if (r > 0) {
    return {
      bg: `rgba(34,197,94,${intensity.toFixed(3)})`,
      fg: intensity >= 0.5 ? "#ffffff" : "#166534",
    };
  }
  return {
    bg: `rgba(239,68,68,${intensity.toFixed(3)})`,
    fg: intensity >= 0.5 ? "#ffffff" : "#991b1b",
  };
}

function formatPct(r: number | null): string {
  if (r === null) return "—";
  return (r >= 0 ? "+" : "") + r.toFixed(1) + "%";
}

interface YearRow {
  year: number;
  months: (number | null)[];
  annual: number | null;
}

function buildHeatmapData(rows: MonthlyRow[]): YearRow[] {
  const byYear = new Map<number, (number | null)[]>();
  for (const row of rows) {
    const [y, m] = row.yearMonth.split("-").map(Number);
    if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null));
    byYear.get(y)![m - 1] = row.returnPct;
  }
  return Array.from(byYear.keys())
    .sort((a, b) => a - b)
    .map((year) => {
      const months = byYear.get(year)!;
      const withData = months.filter((r): r is number => r !== null);
      const annual =
        withData.length > 0
          ? parseFloat(
              (
                (withData.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) *
                100
              ).toFixed(1)
            )
          : null;
      return { year, months, annual };
    });
}

/** 열별(1~12월) 평균 및 연간 평균 — 계절성 요약행. null(결손월) 제외 평균. */
function buildMonthlyAverages(data: YearRow[]): {
  monthly: (number | null)[];
  annual: number | null;
} {
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const vals = data
      .map((d) => d.months[i])
      .filter((r): r is number => r !== null);
    return vals.length > 0
      ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
      : null;
  });
  const annualVals = data
    .map((d) => d.annual)
    .filter((r): r is number => r !== null);
  const annual =
    annualVals.length > 0
      ? parseFloat(
          (annualVals.reduce((a, b) => a + b, 0) / annualVals.length).toFixed(1)
        )
      : null;
  return { monthly, annual };
}

export default function ReturnsHeatmap({
  rows,
  firstAvailable,
}: {
  rows: MonthlyRow[];
  firstAvailable: string | null;
}) {
  const data = buildHeatmapData(rows);
  const avg = buildMonthlyAverages(data);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center text-sm text-gray-400">
        데이터가 없습니다. 백필 스크립트를 먼저 실행해 주세요.
      </div>
    );
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      aria-label="연×월 수익률 히트맵"
    >
      <div className="px-4 pt-4 pb-2 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">연 × 월 수익률 히트맵</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {firstAvailable ? `최초 데이터: ${firstAvailable} · ` : ""}
          결손월·미래월은 — 표시 · 강도 = ±15% 고정 스케일 · 하단 월평균은 전체 연도 평균(계절성)
        </p>
      </div>

      {/* overflow-x-auto: 모바일 가로 스크롤, 연도 열 sticky */}
      <div className="overflow-x-auto">
        <table
          className="text-xs border-collapse w-full"
          style={{ minWidth: "800px" }}
          aria-label="연도별 월간 수익률"
        >
          <thead>
            <tr className="bg-gray-50">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-gray-50 border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-600 w-14 min-w-14"
              >
                연도
              </th>
              {MONTHS_SHORT.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="border-b border-gray-200 px-2 py-2 text-center font-medium text-gray-500 min-w-[54px]"
                >
                  {m}
                </th>
              ))}
              <th
                scope="col"
                className="border-b border-gray-200 border-l-2 border-l-gray-300 px-3 py-2 text-center font-semibold text-gray-700 min-w-[58px]"
              >
                연간
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map(({ year, months, annual }) => {
              const annualColors = cellColors(annual);
              return (
                <tr key={year}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white border-b border-gray-100 border-r border-r-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700 whitespace-nowrap"
                  >
                    {year}
                  </th>
                  {months.map((r, i) => {
                    const { bg, fg } = cellColors(r);
                    return (
                      <td
                        key={i}
                        className="border-b border-gray-100 px-2 py-1.5 text-center tabular-nums whitespace-nowrap"
                        style={{ backgroundColor: bg, color: fg }}
                        title={`${year}년 ${MONTHS_KO[i]}: ${formatPct(r)}`}
                      >
                        {formatPct(r)}
                      </td>
                    );
                  })}
                  <td
                    className="border-b border-gray-100 border-l-2 border-l-gray-300 px-3 py-1.5 text-center tabular-nums font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: annualColors.bg,
                      color: annualColors.fg,
                    }}
                    title={`${year}년 연간: ${formatPct(annual)}`}
                  >
                    {formatPct(annual)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* 월별 평균 요약행 — 연도 데이터와 상단 굵은 구분선으로 분리 */}
          <tfoot>
            <tr className="bg-gray-50">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-gray-50 border-t-2 border-gray-300 border-r border-r-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700 whitespace-nowrap"
              >
                월평균
              </th>
              {avg.monthly.map((r, i) => {
                const { bg, fg } = cellColors(r);
                return (
                  <td
                    key={i}
                    className="border-t-2 border-gray-300 px-2 py-1.5 text-center tabular-nums font-medium whitespace-nowrap"
                    style={{ backgroundColor: bg, color: fg }}
                    title={`${MONTHS_KO[i]} 평균: ${formatPct(r)}`}
                  >
                    {formatPct(r)}
                  </td>
                );
              })}
              {(() => {
                const c = cellColors(avg.annual);
                return (
                  <td
                    className="border-t-2 border-gray-300 border-l-2 border-l-gray-300 px-3 py-1.5 text-center tabular-nums font-bold whitespace-nowrap"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                    title={`연간 평균: ${formatPct(avg.annual)}`}
                  >
                    {formatPct(avg.annual)}
                  </td>
                );
              })()}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
