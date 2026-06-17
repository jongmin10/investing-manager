import { INDICATORS, INDICATOR_TYPES, formatValue } from "@/lib/indicators";
import Link from "next/link";

export const metadata = {
  title: "경제 용어사전 | 퇴직연금 대시보드",
};

const FREQUENCY_LABEL: Record<string, string> = {
  realtime: "실시간",
  daily: "매 영업일",
  monthly: "월 1회",
  event: "이벤트",
};

export default function GlossaryPage() {
  const groups = [
    { title: "금리", types: ["BOK_BASE_RATE", "GOV_BOND_3Y", "GOV_BOND_10Y", "FED_RATE", "US_TREASURY_2Y", "US_TREASURY_10Y"] },
    { title: "주식시장", types: ["KOSPI", "KOSDAQ", "SP500", "NASDAQ100", "SOX"] },
    { title: "물가", types: ["CPI", "PPI", "US_CPI", "US_PPI"] },
    { title: "경기", types: ["CLI", "UNEMPLOYMENT", "US_UNEMPLOYMENT"] },
    { title: "외환 & 변동성", types: ["KRW_USD", "VIX", "FEAR_GREED"] },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-sm text-blue-500 hover:text-blue-700">← 대시보드</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">경제 용어사전</h1>
        <p className="text-sm text-gray-500 mt-1">
          퇴직연금 운용에 필요한 경제지표 용어를 쉽게 설명합니다.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="text-base font-semibold text-gray-700 border-b border-gray-200 pb-2 mb-4">
            {group.title}
          </h2>
          <div className="space-y-4">
            {group.types.map((type) => {
              const meta = INDICATORS[type as keyof typeof INDICATORS];
              return (
                <div key={type} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-gray-900">{meta.name}</h3>
                    {meta.unit && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        단위: {meta.unit || "없음"}
                      </span>
                    )}
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                      {FREQUENCY_LABEL[meta.frequency]}
                    </span>
                    <span className="text-xs text-gray-400">출처: {meta.source}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed mb-2">
                    {meta.glossary}
                  </p>
                  {meta.anomalyThreshold && (
                    <div className="flex items-center gap-1.5 mt-3">
                      <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-lg">
                        ⚠️ 이상 신호 임계값: {meta.anomalyThreshold.value}
                        {meta.unit} {meta.anomalyThreshold.direction === "above" ? "초과" : "미만"} 시 주의
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
