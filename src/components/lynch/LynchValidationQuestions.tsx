import type { LynchResult } from "@/lib/lynch-types";

interface Props {
  validation: LynchResult["validation"];
}

export default function LynchValidationQuestions({ validation }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <h3 className="text-base font-bold text-gray-900 mb-1">
        검증 과제 (숙제)
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        이 분석의 약한 가정과 직접 확인해야 할 1차 자료 — 린치는 공장·점포를 직접 방문했다
      </p>

      {/* 약한 가정 */}
      <div className="mb-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
          가장 약한 가정
        </p>
        <p className="text-sm text-amber-800 leading-relaxed">
          {validation.weakestAssumption}
        </p>
      </div>

      {/* 1차 자료 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          직접 확인할 1차 자료
        </p>
        {validation.sources.map((source, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl"
          >
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center"
              aria-label={`${i + 1}번 과제`}
            >
              {i + 1}
            </span>
            <p className="text-sm text-gray-700 leading-relaxed">{source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
