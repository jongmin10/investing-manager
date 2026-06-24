"use client";

const STEPS = [
  "DB에서 종목 데이터 조회 중…",
  "재무 스냅샷 및 지표 준비 중…",
  "피터 린치 분석 모델 실행 중 (AI)…",
  "결과 구조화 및 저장 중…",
];

interface Props {
  step?: number; // 0-based, 0~3
  elapsed?: number; // seconds
}

export default function LynchLoadingState({ step = 0, elapsed = 0 }: Props) {
  const currentStep = Math.min(step, STEPS.length - 1);

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6"
      role="status"
      aria-live="polite"
      aria-label="피터 린치 분석 진행 중"
    >
      {/* 스텝 인디케이터 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">
            [{currentStep + 1}/{STEPS.length}] {STEPS[currentStep]}
          </p>
          {elapsed > 0 && (
            <span className="text-xs text-gray-400">{elapsed}초 경과</span>
          )}
        </div>

        {/* 진행 바 */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* 스텝 점 */}
        <div className="flex items-center justify-between mt-2 px-0.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                i <= currentStep ? "bg-blue-400" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* 스켈레톤 */}
      <div className="space-y-4" aria-hidden="true">
        {/* 헤더 카드 스켈레톤 */}
        <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />

        {/* 체크리스트 스켈레톤 */}
        <div className="bg-gray-100 rounded-2xl animate-pulse p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-xl" />
          ))}
        </div>

        {/* 드릴 카드 그리드 스켈레톤 */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* 결론 블록 스켈레톤 */}
        <div className="h-24 bg-blue-100 rounded-2xl animate-pulse" />
      </div>

      <p className="text-xs text-center text-gray-400">
        AI 분석은 보통 10~30초 소요됩니다. 잠시만 기다려주세요.
      </p>
    </div>
  );
}
