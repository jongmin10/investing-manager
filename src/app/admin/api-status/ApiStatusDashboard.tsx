"use client";

import { useEffect, useState } from "react";

// ── 타입 (날짜는 ISO 문자열로 직렬화 후 전달) ───────────────────────────────

export interface HealthRow {
  id: string;
  apiKey: string;
  status: string;
  httpStatus: number | null;
  latencyMs: number | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string;
  message: string | null;
}

export interface RequestRow {
  id: string;
  createdAt: string; // ISO — Date/Time
  apiKey: string | null;
  method: string;
  url: string; // Request URL (비밀 파라미터 마스킹됨)
  statusCode: number | null; // Response Code (null = 네트워크 오류/타임아웃)
  responseTimeMs: number; // Response Time
  ok: boolean;
  error: string | null; // 네트워크 오류 사유(hover 표시)
}

interface Props {
  initialHealth: HealthRow[];
  initialRequests: RequestRow[];
}

// ── 표시용 레이블·설정 ──────────────────────────────────────────────────────

const API_LABELS: Record<string, string> = {
  NAVER: "NAVER Finance",
  DART: "DART",
  EDGAR: "SEC EDGAR",
  OPENFIGI: "OpenFIGI",
  OPENROUTER: "OpenRouter",
  OECD: "OECD",
};

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  up:       { label: "정상",     bg: "bg-green-100", text: "text-green-700",  dot: "bg-green-500"  },
  down:     { label: "장애",     bg: "bg-red-100",   text: "text-red-700",    dot: "bg-red-500"    },
  degraded: { label: "저하",     bg: "bg-amber-100", text: "text-amber-700",  dot: "bg-amber-400"  },
  unknown:  { label: "알수없음", bg: "bg-gray-100",  text: "text-gray-600",   dot: "bg-gray-400"   },
};

// 응답 코드 → 배지 색상. null(네트워크 오류)·4xx·5xx 는 빨강, 2xx 초록, 3xx 앰버.
function statusCodeCfg(code: number | null): { bg: string; text: string } {
  if (code === null) return { bg: "bg-red-100", text: "text-red-700" };
  if (code >= 200 && code < 300) return { bg: "bg-green-100", text: "text-green-700" };
  if (code >= 300 && code < 400) return { bg: "bg-amber-100", text: "text-amber-700" };
  return { bg: "bg-red-100", text: "text-red-700" };
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function fmtLatency(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// 요청 로그용 Date/Time — 요청이 잦아 초 단위까지 표기. hour12:false 로 하이드레이션 일치.
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  // hour12: false 로 24시간제 고정 — 서버(PM)/클라이언트(오후) 오전·오후 표기
  // 차이로 인한 하이드레이션 불일치 방지.
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function ApiStatusDashboard({ initialHealth, initialRequests }: Props) {
  const [health, setHealth] = useState<HealthRow[]>(initialHealth);
  const [requests, setRequests] = useState<RequestRow[]>(initialRequests);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ type: "throttled" | "ok" | "error"; text: string } | null>(null);
  const [healthDetailOpen, setHealthDetailOpen] = useState(false);

  // 모달 열림 동안 ESC 로 닫기
  useEffect(() => {
    if (!healthDetailOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHealthDetailOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [healthDetailOpen]);

  // ── "지금 점검" 버튼 ──────────────────────────────────────────────────────
  async function handleCheck() {
    setChecking(true);
    setCheckMsg(null);
    try {
      const res = await fetch("/api/admin/api-status/check", { method: "POST" });
      if (res.status === 429) {
        // 레이트가드: 정상 응답(오류 아님). retryAfterSec 안내.
        const data = (await res.json()) as {
          throttled: true;
          retryAfterSec: number;
          health: HealthRow[];
        };
        setHealth(data.health);
        setCheckMsg({ type: "throttled", text: `${data.retryAfterSec}초 후 재시도 가능합니다` });
      } else if (res.ok) {
        const data = (await res.json()) as {
          throttled: false;
          health: HealthRow[];
          checkedAt: string;
        };
        setHealth(data.health);
        setCheckMsg({ type: "ok", text: "점검 완료" });
      } else {
        setCheckMsg({ type: "error", text: `오류 (HTTP ${res.status})` });
      }
    } catch {
      setCheckMsg({ type: "error", text: "네트워크 오류" });
    } finally {
      setChecking(false);
    }
  }

  // ── 요청 로그 새로고침 ────────────────────────────────────────────────────
  async function handleRefreshRequests() {
    try {
      const res = await fetch("/api/admin/api-status?limit=100");
      if (res.ok) {
        const data = (await res.json()) as { requests: RequestRow[] };
        setRequests(data.requests);
      }
    } catch {
      // silent — 로그 조회 실패는 화면 유지
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API 호출 상태</h1>
          <p className="text-sm text-gray-400 mt-0.5">외부 API 헬스 · API 요청 로그</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCheck}
            disabled={checking}
            aria-busy={checking}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? (
              <>
                <span
                  className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  aria-hidden="true"
                />
                점검 중...
              </>
            ) : (
              "지금 점검"
            )}
          </button>
          <button
            onClick={handleRefreshRequests}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            로그 새로고침
          </button>
        </div>
      </div>

      {/* 점검 결과 인라인 메시지 */}
      {checkMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl px-4 py-3 text-sm ${
            checkMsg.type === "ok"
              ? "bg-green-50 border border-green-200 text-green-700"
              : checkMsg.type === "throttled"
              ? "bg-amber-50 border border-amber-200 text-amber-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {checkMsg.type === "throttled"
            ? `레이트 가드 — ${checkMsg.text}`
            : checkMsg.type === "ok"
            ? `점검 완료`
            : `오류: ${checkMsg.text}`}
        </div>
      )}

      {/* ── 외부 API 헬스 (최소화 — 상세는 팝업 모달) ───────────────────────── */}
      <section aria-labelledby="health-heading">
        <div className="flex items-center justify-between mb-3">
          <h2
            id="health-heading"
            className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            외부 API 헬스
          </h2>
          {health.length > 0 && (
            <button
              onClick={() => setHealthDetailOpen(true)}
              className="text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
            >
              상세 보기 →
            </button>
          )}
        </div>

        {health.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-center shadow-sm">
            <p className="text-gray-400 text-sm">
              아직 점검 이력이 없습니다. &apos;지금 점검&apos;을 눌러 확인하세요.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setHealthDetailOpen(true)}
            aria-label="외부 API 헬스 상세 보기"
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm hover:bg-gray-50 transition-colors text-left"
          >
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {health.map((h) => {
                const cfg = STATUS_CFG[h.status] ?? STATUS_CFG.unknown;
                return (
                  <span
                    key={h.apiKey}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-600 min-w-0"
                    title={`${API_LABELS[h.apiKey] ?? h.apiKey}: ${cfg.label}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{API_LABELS[h.apiKey] ?? h.apiKey}</span>
                  </span>
                );
              })}
            </div>
          </button>
        )}
      </section>

      {/* ── 헬스 상세 팝업 모달 ───────────────────────────────────────────── */}
      {healthDetailOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setHealthDetailOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="health-modal-title"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="health-modal-title" className="text-lg font-bold text-gray-900">
                외부 API 헬스 상세
              </h2>
              <button
                onClick={() => setHealthDetailOpen(false)}
                aria-label="닫기"
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {health.map((h) => {
                const cfg = STATUS_CFG[h.status] ?? STATUS_CFG.unknown;
                return (
                  <article
                    key={h.apiKey}
                    className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm"
                    aria-label={`${API_LABELS[h.apiKey] ?? h.apiKey} 헬스 상태`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-gray-900 text-sm">
                        {API_LABELS[h.apiKey] ?? h.apiKey}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`}
                          aria-hidden="true"
                        />
                        {cfg.label}
                      </span>
                    </div>

                    <dl className="space-y-1.5 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <dt>응답시간</dt>
                        <dd className="font-mono text-gray-800">{fmtLatency(h.latencyMs)}</dd>
                      </div>
                      {h.httpStatus !== null && (
                        <div className="flex justify-between">
                          <dt>HTTP 상태</dt>
                          <dd className="font-mono text-gray-800">{h.httpStatus}</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt>마지막 성공</dt>
                        <dd className="text-gray-700">{fmtTime(h.lastSuccessAt)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>마지막 점검</dt>
                        <dd className="text-gray-700">{fmtTime(h.lastCheckedAt)}</dd>
                      </div>
                      {h.message && (
                        <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                          <p className="text-[11px] text-gray-400 leading-tight break-all">
                            {h.message}
                          </p>
                        </div>
                      )}
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── API 요청 로그 ─────────────────────────────────────────────────── */}
      <section aria-labelledby="requests-heading">
        <h2
          id="requests-heading"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
        >
          API 요청 로그 (최근 {requests.length}건)
        </h2>

        {requests.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-400 text-sm">API 요청 로그가 없습니다.</p>
            <p className="text-gray-300 text-xs mt-1">
              수집·분석 등 시스템이 외부 API를 호출하면 여기에 기록됩니다.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

            {/* 모바일: 카드형 목록 */}
            <ul className="sm:hidden divide-y divide-gray-100">
              {requests.map((r) => {
                const scfg = statusCodeCfg(r.statusCode);
                return (
                  <li key={r.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                          {r.apiKey ?? "—"}
                        </span>
                        <span className="font-mono text-[11px] text-gray-400">{r.method}</span>
                      </div>
                      <span
                        className={`flex-shrink-0 font-mono text-xs px-2 py-0.5 rounded-full font-medium ${scfg.bg} ${scfg.text}`}
                      >
                        {r.statusCode ?? "ERR"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 break-all leading-tight font-mono">{r.url}</p>
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>{fmtDateTime(r.createdAt)}</span>
                      <span className="font-mono">{fmtLatency(r.responseTimeMs)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* 데스크탑: 테이블형 — Date/Time · API · URL · 응답코드 · 응답시간 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      Date/Time
                    </th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      API
                    </th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Request URL
                    </th>
                    <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      Response Code
                    </th>
                    <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      Response Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requests.map((r) => {
                    const scfg = statusCodeCfg(r.statusCode);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs font-mono">
                          {fmtDateTime(r.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {r.apiKey ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[24rem]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{r.method}</span>
                            <span className="font-mono text-xs text-gray-700 break-all leading-tight">{r.url}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex font-mono px-2 py-0.5 rounded-full text-xs font-medium ${scfg.bg} ${scfg.text}`}
                            title={r.error ?? undefined}
                          >
                            {r.statusCode ?? "ERR"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600 whitespace-nowrap">
                          {fmtLatency(r.responseTimeMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
