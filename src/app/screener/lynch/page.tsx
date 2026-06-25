"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import type { LynchResponse } from "@/lib/lynch-types";
import { DEFAULT_LYNCH_MODEL, LYNCH_MODELS } from "@/lib/lynch-models";
import LynchTickerInput from "@/components/lynch/LynchTickerInput";
import LynchLoadingState from "@/components/lynch/LynchLoadingState";
import LynchStockHeader from "@/components/lynch/LynchStockHeader";
import LynchChecklist from "@/components/lynch/LynchChecklist";
import LynchTwoMinuteDrill from "@/components/lynch/LynchTwoMinuteDrill";
import LynchFlags from "@/components/lynch/LynchFlags";
import LynchVerdict from "@/components/lynch/LynchVerdict";
import LynchValidationQuestions from "@/components/lynch/LynchValidationQuestions";

type AnalysisState = "idle" | "pending" | "done" | "failed";

const POLL_INTERVAL_MS   = 1500;
const TIMEOUT_MS         = 30_000;

// 진행 단계·진행률을 '실제 경과시간'으로 도출 — 폴링 횟수로 가짜 전진시키지 않는다.
// 백엔드는 pending→done 단일 신호만 주므로 개별 단계의 실시간 보고는 불가하나,
// 실제 소요 분포(DB·스냅샷은 수초, AI가 대부분)를 반영해 표시한다.
//  - 0~1.5s: DB 조회 / 1.5~3.5s: 스냅샷 준비 / 이후: AI 실행(완료까지 이 단계 유지)
function stepFromElapsed(sec: number): number {
  if (sec < 1.5) return 0;
  if (sec < 3.5) return 1;
  return 2; // "AI 분석 모델 실행 중" — done 감지 전까지 여기서 머문다(저장 단계로 넘기지 않음)
}
// 점근 곡선: 초반 빠르게 오르다 완만해지며 완료 전까지 95%를 넘지 않는다.
// (실제 done 시 로딩 UI가 사라지므로 100%까지 채울 필요 없음 — "100% 멈춤" 인상 제거)
function progressFromElapsed(sec: number): number {
  return Math.min(0.95, 1 - Math.exp(-sec / 10));
}

export default function LynchPage() {
  const { data: session, status: sessionStatus } = useSession();

  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [data,          setData]          = useState<LynchResponse | null>(null);
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);
  const [authError,     setAuthError]     = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_LYNCH_MODEL.id);

  const abortRef   = useRef<AbortController | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 클린업
  function cleanup() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }

  useEffect(() => () => cleanup(), []);

  const startElapsed = useCallback(() => {
    setElapsed(0);
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);

  const poll = useCallback(
    async (ticker: string, controller: AbortController) => {
      while (!controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (controller.signal.aborted) break;

        try {
          const res = await fetch(`/api/lynch/${ticker}`, {
            signal: controller.signal,
          });

          if (res.status === 401) {
            setAuthError(true);
            setAnalysisState("failed");
            setErrorMsg(null);
            cleanup();
            return;
          }

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setErrorMsg(body.error ?? `오류 코드 ${res.status}`);
            setAnalysisState("failed");
            cleanup();
            return;
          }

          const body: LynchResponse = await res.json();

          if (body.status === "done") {
            setData(body);
            setAnalysisState("done");
            cleanup();
            return;
          }

          if (body.status === "failed") {
            setErrorMsg(body.error ?? "분석에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            setAnalysisState("failed");
            cleanup();
            return;
          }

          // still pending — 진행 표시는 elapsed 기반으로 렌더에서 도출하므로 여기선 대기만.
        } catch (e) {
          if ((e as Error).name === "AbortError") break;
          setErrorMsg("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
          setAnalysisState("failed");
          cleanup();
          return;
        }
      }
    },
    []
  );

  const handleAnalyse = useCallback(
    async (ticker: string) => {
      if (!session) {
        setAuthError(true);
        return;
      }

      cleanup();
      setAnalysisState("pending");
      setData(null);
      setErrorMsg(null);
      setAuthError(false);
      startElapsed();

      const controller = new AbortController();
      abortRef.current = controller;

      // 30초 타임아웃
      timerRef.current = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort();
          setErrorMsg("분석이 오래 걸리고 있습니다. 잠시 후 다시 시도하면 완료된 결과를 볼 수 있습니다.");
          setAnalysisState("failed");
          cleanup();
        }
      }, TIMEOUT_MS);

      try {
        const res = await fetch(`/api/lynch/${ticker}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: selectedModel }),
          signal: controller.signal,
        });

        if (res.status === 401) {
          setAuthError(true);
          setAnalysisState("failed");
          cleanup();
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMsg(body.error ?? `오류 코드 ${res.status}`);
          setAnalysisState("failed");
          cleanup();
          return;
        }

        const body: LynchResponse = await res.json();

        if (body.status === "done") {
          // 캐시 히트 — 즉시 결과
          setData(body);
          setAnalysisState("done");
          cleanup();
          return;
        }

        // pending — 폴링 시작 (진행 표시는 elapsed 기반으로 렌더에서 도출)
        await poll(ticker, controller);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setErrorMsg("요청 중 오류가 발생했습니다. 다시 시도해 주세요.");
        setAnalysisState("failed");
        cleanup();
      }
    },
    [session, poll, startElapsed, selectedModel]
  );

  const isLoggedIn   = sessionStatus !== "loading" && !!session;
  const isLoading    = sessionStatus === "loading";
  const inputDisabled = analysisState === "pending" || isLoading;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* ── 헤더 ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">피터 린치 종목분석</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          <em>One Up on Wall Street</em> 6단계 프레임워크로 한국 종목을 분석합니다.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
            🐢 한국 종목 6자리 코드 전용
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">
            ✦ {LYNCH_MODELS.find((m) => m.id === selectedModel)?.label ?? DEFAULT_LYNCH_MODEL.label}
          </span>
        </div>
      </div>

      {/* ── 비로그인 배너 ── */}
      {!isLoggedIn && !isLoading && (
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl"
          role="alert"
          aria-label="로그인 필요 안내"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5" aria-hidden="true">🔒</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                로그인 후 이용할 수 있습니다
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                AI 분석은 토큰 비용이 발생하므로 로그인 사용자만 이용할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            onClick={() => signIn()}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
            aria-label="로그인 페이지로 이동"
          >
            로그인
          </button>
        </div>
      )}

      {/* 401 폴백 배너 (로그인 상태지만 API가 401 반환한 경우) */}
      {authError && isLoggedIn && (
        <div
          className="p-4 bg-red-50 border border-red-100 rounded-xl"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-700">
            세션이 만료되었습니다. 다시 로그인해 주세요.
          </p>
          <button
            onClick={() => { setAuthError(false); signIn(); }}
            className="mt-2 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
          >
            다시 로그인
          </button>
        </div>
      )}

      {/* ── 입력 영역 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <LynchTickerInput
          onSubmit={handleAnalyse}
          disabled={inputDisabled || (!isLoggedIn && !isLoading)}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
        <p className="text-xs text-gray-400 mt-2">
          코스피·코스닥 시총 상위 200 종목이 자동완성됩니다. 6자리 코드를 직접 입력해도 됩니다.
        </p>
      </div>

      {/* ── 초기 상태 ── */}
      {analysisState === "idle" && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-6xl mb-4 block" role="img" aria-label="거북이">🐢</span>
          <p className="text-gray-600 font-medium text-lg">종목코드를 입력하고 분석을 시작하세요</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">
            피터 린치의 6단계 체크리스트로 한국 종목을 심층 분석합니다
          </p>
        </div>
      )}

      {/* ── 로딩 ── */}
      {analysisState === "pending" && (
        <LynchLoadingState
          step={stepFromElapsed(elapsed)}
          elapsed={elapsed}
          progress={progressFromElapsed(elapsed)}
        />
      )}

      {/* ── 에러 ── */}
      {analysisState === "failed" && !authError && errorMsg && (
        <div
          className="p-4 bg-red-50 border border-red-100 rounded-2xl space-y-3"
          role="alert"
          aria-label="분석 오류"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5 flex-shrink-0" aria-hidden="true">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-700">분석 중 오류가 발생했습니다</p>
              <p className="text-sm text-red-600 mt-0.5">{errorMsg}</p>
            </div>
          </div>
          <button
            onClick={() => setAnalysisState("idle")}
            className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ── 결과 ── */}
      {analysisState === "done" && data?.result && (
        <div className="space-y-4">
          {/* [A] 종목 헤더 */}
          <LynchStockHeader data={data} />

          {/* [B] 7개 체크리스트 */}
          <LynchChecklist metrics={data.result.checklist} />

          {/* [C] 2분 드릴 */}
          <LynchTwoMinuteDrill drill={data.result.twoMinuteDrill} />

          {/* [D] Green/Red Flags */}
          <LynchFlags
            greenFlags={data.result.greenFlags}
            redFlags={data.result.redFlags}
          />

          {/* [E] 결론 */}
          <LynchVerdict verdict={data.result.verdict} />

          {/* [F] 검증 과제 */}
          <LynchValidationQuestions validation={data.result.validation} />

          {/* 재분석 */}
          <div className="flex justify-end">
            <button
              onClick={() => setAnalysisState("idle")}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              다른 종목 분석하기
            </button>
          </div>
        </div>
      )}

      {/* done이지만 result가 null인 경우 */}
      {analysisState === "done" && data && !data.result && (
        <div
          className="p-4 bg-amber-50 border border-amber-100 rounded-2xl"
          role="alert"
        >
          <p className="text-sm font-semibold text-amber-700">
            분석 결과를 불러올 수 없습니다
          </p>
          <p className="text-xs text-amber-600 mt-1">
            {data.error ?? "결과가 비어 있습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </div>
      )}
    </div>
  );
}
