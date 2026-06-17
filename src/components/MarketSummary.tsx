import { MarketSummary, Sentiment, InsightPoint } from "@/lib/analysis";

const STYLE: Record<Sentiment, {
  wrap: string; badge: string; headline: string; divider: string;
}> = {
  strong_bull: {
    wrap:     "bg-emerald-50 border-emerald-200",
    badge:    "bg-emerald-100 text-emerald-700",
    headline: "text-emerald-900",
    divider:  "border-emerald-200",
  },
  bull: {
    wrap:     "bg-green-50 border-green-200",
    badge:    "bg-green-100 text-green-700",
    headline: "text-green-900",
    divider:  "border-green-200",
  },
  neutral: {
    wrap:     "bg-slate-50 border-slate-200",
    badge:    "bg-slate-100 text-slate-600",
    headline: "text-slate-800",
    divider:  "border-slate-200",
  },
  bear: {
    wrap:     "bg-orange-50 border-orange-200",
    badge:    "bg-orange-100 text-orange-700",
    headline: "text-orange-900",
    divider:  "border-orange-200",
  },
  strong_bear: {
    wrap:     "bg-red-50 border-red-200",
    badge:    "bg-red-100 text-red-700",
    headline: "text-red-900",
    divider:  "border-red-200",
  },
};

const SIGNAL_TEXT: Record<InsightPoint["signal"], string> = {
  positive: "text-emerald-700",
  negative: "text-red-600",
  warning:  "text-amber-700",
  neutral:  "text-gray-600",
};

export default function MarketSummaryCard({ summary }: { summary: MarketSummary }) {
  const s = STYLE[summary.sentiment];

  return (
    <div className={`rounded-2xl border ${s.wrap} px-5 py-4`}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          시장 분석
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
          {summary.sentimentLabel}
        </span>
      </div>

      {/* 헤드라인 */}
      <p className={`text-sm font-semibold leading-snug mb-4 ${s.headline}`}>
        {summary.headline}
      </p>

      {/* 포인트 목록 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-4">
        {summary.points.map((pt) => (
          <div key={pt.category} className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5 flex-shrink-0">{pt.icon}</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-1">
                {pt.category}
              </span>
              <span className={`text-[11px] leading-relaxed ${SIGNAL_TEXT[pt.signal]}`}>
                {pt.text}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 퇴직연금 시사점 */}
      <div className={`border-t ${s.divider} pt-3`}>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          <span className="font-semibold text-gray-700">💡 퇴직연금 시사점 &nbsp;</span>
          {summary.implication}
        </p>
      </div>
    </div>
  );
}
