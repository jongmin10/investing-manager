import {
  getExportSeries,
  getExportRanking,
  getExportMeta,
  isItemCode,
  isMetric,
  isValidYearMonth,
  currentYearMonth,
  DEFAULT_ITEM,
  itemName,
  type ExportMetric,
} from "@/lib/exports";
import ExportControls from "./ExportControls";
import ExportSummaryCards from "./ExportSummaryCards";
import ExportRanking from "./ExportRanking";
import ExportTrendChart from "./ExportTrendChart";

// searchParams 가 Promise 인 Next.js 16 — await 필수
export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const meta = await getExportMeta();

  const minMonth = meta.firstAvailable ?? "2015-01";
  const maxMonth = currentYearMonth();
  const latest = meta.latestConfirmedYm ?? meta.firstAvailable ?? maxMonth;

  const rawItem = typeof sp.item === "string" ? sp.item : DEFAULT_ITEM;
  const item = isItemCode(rawItem) ? rawItem : DEFAULT_ITEM;

  const rawMetric = typeof sp.metric === "string" ? sp.metric : "export";
  const metric: ExportMetric = isMetric(rawMetric) ? rawMetric : "export";

  const rawFrom = typeof sp.from === "string" ? sp.from : "";
  const rawTo = typeof sp.to === "string" ? sp.to : "";
  const from = isValidYearMonth(rawFrom) ? rawFrom : minMonth;
  const to = isValidYearMonth(rawTo) ? rawTo : latest;

  const [series, ranking] = await Promise.all([
    getExportSeries(item, from, to, metric),
    getExportRanking(to, metric, 10),
  ]);

  return (
    <div className="space-y-6">
      {/* 헤더 + 컨트롤 */}
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">월별 품목별 수출</h1>
          <p className="text-sm text-gray-500 mt-1">
            관세청 신고 미화금액(USD·수출 FOB/수입 CIF) · 당월은 잠정치(확정은 다음 달 15일경)
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            품목군은 HS코드 기준 근사 — 산업부 공식 품목(MTI) 수치와 다를 수 있습니다.
          </p>
        </div>
        <ExportControls
          items={meta.items}
          item={item}
          from={from}
          to={to}
          metric={metric}
          minMonth={minMonth}
          maxMonth={maxMonth}
          latestMonth={latest}
        />
      </div>

      {/* 요약 카드 */}
      <ExportSummaryCards data={series} />

      {/* 추세 차트 */}
      <ExportTrendChart rows={series.rows} metric={metric} itemName={itemName(item)} />

      {/* 당월 품목 랭킹 */}
      <ExportRanking data={ranking} from={from} to={to} metric={metric} />

      {/* 면책조항은 layout.tsx footer 전역 렌더 */}
    </div>
  );
}
