import type { LynchMetric } from "@/lib/lynch-types";

interface Props {
  metrics: LynchMetric[];
}

function ResultIcon({ result }: { result: "PASS" | "FAIL" | "NA" }) {
  if (result === "PASS") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold"
        aria-label="통과"
        title="통과"
      >
        ✓
      </span>
    );
  }
  if (result === "FAIL") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-sm font-bold"
        aria-label="실패"
        title="실패"
      >
        ✗
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-bold"
      aria-label="확인 불가"
      title="확인 불가"
    >
      N/A
    </span>
  );
}

export default function LynchChecklist({ metrics }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-base font-bold text-gray-900">
          7개 핵심지표 체크리스트
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          피터 린치 기준 정량 평가 — 확인 불가 항목은 공시 부재로 Phase 2 보강 예정
        </p>
      </div>

      {/* 모바일 가로 스크롤 래퍼 */}
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[600px] text-sm"
          role="table"
          aria-label="피터 린치 핵심지표 체크리스트"
        >
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th
                scope="col"
                className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-5 py-2.5 w-48"
              >
                지표
              </th>
              <th
                scope="col"
                className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-2.5 w-24"
              >
                현재값
              </th>
              <th
                scope="col"
                className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-2.5 w-36"
              >
                린치 기준
              </th>
              <th
                scope="col"
                className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-2.5 w-16"
              >
                판정
              </th>
              <th
                scope="col"
                className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-5 py-2.5"
              >
                코멘트
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {metrics.map((m) => (
              <tr
                key={m.key}
                className={`transition-colors hover:bg-gray-50/50 ${
                  m.result === "NA" ? "opacity-70" : ""
                }`}
              >
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-800 text-sm">{m.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{m.source}</p>
                </td>
                <td className="px-3 py-3 text-right">
                  {m.value != null ? (
                    <span className="font-mono font-semibold text-gray-800">
                      {m.value}
                    </span>
                  ) : (
                    <span className="text-gray-300 italic text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-gray-600">{m.lynchCriterion}</span>
                </td>
                <td className="px-3 py-3 text-center">
                  <ResultIcon result={m.result} />
                </td>
                <td className="px-5 py-3">
                  <p
                    className={`text-xs leading-relaxed ${
                      m.result === "NA"
                        ? "text-gray-400 italic"
                        : "text-gray-600"
                    }`}
                  >
                    {m.comment}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 스크롤 힌트 */}
      <div className="md:hidden px-5 py-2 border-t border-gray-100 flex items-center gap-1.5">
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-4 4 4 4M16 9l4 4-4 4" />
        </svg>
        <span className="text-[10px] text-gray-400">좌우 스크롤로 전체 확인</span>
      </div>
    </div>
  );
}
