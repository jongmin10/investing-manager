"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SURVEY_QUESTIONS } from "@/lib/portfolio";

export default function SurveyPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(Array(SURVEY_QUESTIONS.length).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0); // 현재 문항 인덱스

  const current = SURVEY_QUESTIONS[step];
  const isLast = step === SURVEY_QUESTIONS.length - 1;
  const progress = ((step) / SURVEY_QUESTIONS.length) * 100;

  function selectOption(score: number) {
    const next = [...answers];
    next[step] = score;
    setAnswers(next);

    if (!isLast) {
      setTimeout(() => setStep(step + 1), 300);
    }
  }

  async function handleSubmit() {
    if (answers.some((a) => a === null)) return;
    setSubmitting(true);

    await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    router.push("/portfolio");
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-xl p-8">
        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-gray-900">투자 성향 진단</h1>
            <span className="text-sm text-gray-400">
              {step + 1} / {SURVEY_QUESTIONS.length}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 문항 */}
        <div className="mb-8">
          <p className="text-base font-semibold text-gray-800 mb-4 leading-relaxed">
            Q{step + 1}. {current.question}
          </p>
          <div className="space-y-2.5">
            {current.options.map((opt) => {
              const selected = answers[step] === opt.score;
              return (
                <button
                  key={opt.score}
                  onClick={() => selectOption(opt.score)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all
                    ${selected
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700"
                    }`}
                >
                  <span className="text-gray-400 mr-2">{opt.score}.</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 네비게이션 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="text-sm text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← 이전
          </button>

          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={answers[step] === null || submitting}
              className="bg-blue-500 text-white px-6 py-2 rounded-full text-sm font-medium
                hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "분석 중..." : "결과 보기 →"}
            </button>
          ) : (
            <button
              onClick={() => answers[step] !== null && setStep(step + 1)}
              disabled={answers[step] === null}
              className="text-sm text-blue-500 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
            >
              다음 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
