import type { LynchResponse, SixCategory } from "@/lib/lynch-types";

const CATEGORY_META: Record<
  SixCategory,
  { label: string; className: string }
> = {
  SLOW_GROWER:  { label: "저성장주",   className: "bg-gray-100 text-gray-600 border border-gray-200" },
  STALWART:     { label: "대형우량주", className: "bg-blue-100 text-blue-700 border border-blue-200" },
  FAST_GROWER:  { label: "고성장주",   className: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
  CYCLICAL:     { label: "경기순환주", className: "bg-amber-100 text-amber-700 border border-amber-200" },
  ASSET_PLAY:   { label: "자산주",     className: "bg-violet-100 text-violet-700 border border-violet-200" },
  TURNAROUND:   { label: "턴어라운드", className: "bg-orange-100 text-orange-700 border border-orange-200" },
};

interface Props {
  data: LynchResponse;
}

export default function LynchStockHeader({ data }: Props) {
  const categories = data.result?.categories ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">{data.name}</h2>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                data.market === "KOSPI"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {data.market}
            </span>
            <span className="text-sm text-gray-400 font-mono">{data.ticker}</span>
          </div>
          {data.sector && (
            <p className="text-sm text-gray-500 mt-0.5">{data.sector}</p>
          )}
          {data.analyzedAt && (
            <p className="text-xs text-gray-400 mt-1">
              분석 기준:{" "}
              {new Date(data.analyzedAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Six Category 배지 */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="피터 린치 종목 분류">
            {categories.map((cat, i) => {
              const meta = CATEGORY_META[cat.type];
              return (
                <div
                  key={i}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${meta.className}`}
                >
                  <span>{meta.label}</span>
                  {cat.weightPct != null && (
                    <span className="ml-1 opacity-70">({cat.weightPct}%)</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 카테고리 근거 */}
      {categories.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {categories.map((cat, i) => (
            <p key={i} className="text-sm text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-700">
                {CATEGORY_META[cat.type].label}:{" "}
              </span>
              {cat.rationale}
            </p>
          ))}
        </div>
      )}

      {/* 데이터 한계 경고 배지 */}
      {data.dataLimitations.length > 0 && (
        <div
          className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl"
          role="alert"
          aria-label="데이터 확인 불가 항목"
        >
          <p className="text-xs font-semibold text-amber-700 mb-1">
            ⚠ 아래 항목은 측정 한계 또는 대용 지표 사용 사실을 고지합니다
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.dataLimitations.map((lim, i) => (
              <span
                key={i}
                className="text-[11px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full"
              >
                {lim}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
