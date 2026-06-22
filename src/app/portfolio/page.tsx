"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Allocation, MarketSignal, RiskType, getEtfRecommendations } from "@/lib/portfolio";

const YEAR_OPTIONS = [1, 3, 5, 10, 20, 30];
const GUARANTEED_CAGR = 2.3;

type Tab = "allocation" | "etf" | "returns" | "rebalancing";

interface PortfolioData {
  riskType: RiskType;
  riskTypeLabel: string;
  riskTypeDesc: string;
  allocation: Allocation;
  baseAllocation: Allocation;
  signals: MarketSignal[];
  indicators: { vix: number; cpi: number; usCpi: number; cli: number; sp500Change: number };
  updatedAt: string;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const ASSET_LABELS = ["원리금보장", "채권형", "혼합형", "주식형"];
const ASSET_KEYS: (keyof Allocation)[] = ["guaranteed", "bond", "mixed", "equity"];

const SEVERITY_STYLE: Record<string, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  danger:  "bg-red-50 border-red-300 text-red-800",
};
const SEVERITY_ICON: Record<string, string> = { info: "💡", warning: "⚠️", danger: "🚨" };

function allocationToChart(alloc: Allocation) {
  return ASSET_LABELS.map((name, i) => ({ name, value: alloc[ASSET_KEYS[i]] })).filter((d) => d.value > 0);
}

function formatKRW(amount: number): string {
  if (Math.abs(amount) >= 100_000_000)
    return `${amount >= 0 ? "+" : ""}${(amount / 100_000_000).toFixed(1)}억원`;
  return `${amount >= 0 ? "+" : ""}${(amount / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원`;
}

function calcReturn(cagr: number, years: number) {
  return parseFloat(((Math.pow(1 + cagr / 100, years) - 1) * 100).toFixed(1));
}

const TABS: { key: Tab; label: string }[] = [
  { key: "allocation",  label: "자산 배분"  },
  { key: "etf",         label: "ETF 추천"   },
  { key: "returns",     label: "수익률 분석" },
  { key: "rebalancing", label: "리밸런싱"   },
];

// 보유 비중 입력칸: 편집 중에는 원시 문자열 유지(자유 편집·비우기 허용), 클램핑은 blur에서만
function AllocInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="number" min={0} max={100} step={1} value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "") return; // 비우는 중 — 값 유지
        const n = Number(raw);
        if (!Number.isNaN(n) && n >= 0 && n <= 100) onChange(n);
      }}
      onBlur={() => {
        const n = Number(text);
        const next = text === "" || Number.isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
        onChange(next);
        setText(String(next));
      }}
      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-300"
    />
  );
}

export default function PortfolioPage() {
  const [data,    setData]    = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);
  const [tab, setTab] = useState<Tab>("allocation");

  // 수익률 분석
  const [selectedYears,       setSelectedYears]       = useState(10);
  const [totalInvestmentInput, setTotalInvestmentInput] = useState("");

  // 리밸런싱
  const [rebalTotalInput, setRebalTotalInput] = useState("");
  const [currentAlloc,    setCurrentAlloc]    = useState<Allocation>({ guaranteed: 0, bond: 0, mixed: 0, equity: 100 });

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => {
        if (r.status === 401 || r.status === 404) { setNoProfile(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (d && d.allocation) { setData(d); setLoading(false); }
        else if (d) { setNoProfile(true); setLoading(false); }
      });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-gray-400">포트폴리오를 분석하는 중...</p>
    </div>
  );

  if (noProfile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <p className="text-gray-600 text-lg font-medium">아직 투자 성향 진단을 하지 않으셨어요.</p>
      <p className="text-gray-400 text-sm">5가지 질문으로 맞춤 포트폴리오를 제안해드립니다.</p>
      <Link href="/survey" className="mt-2 bg-blue-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-blue-600 transition-colors">
        성향 진단 시작하기 →
      </Link>
    </div>
  );

  if (!data) return null;

  // ── 공통 계산 ──────────────────────────────────────────
  const chartData     = allocationToChart(data.allocation);
  const hasSignalAdjust = data.signals.some((s) => s.allocationAdjust);
  const etfGroups     = getEtfRecommendations(data.riskType, data.allocation);
  const krCpi         = data.indicators.cpi;

  const etfReturnRows = etfGroups.flatMap((group) =>
    group.isGuaranteed
      ? [{ name: "원리금보장 상품", ticker: "-", portfolioPct: group.allocationPct, cagr: GUARANTEED_CAGR, estimatedReturn: calcReturn(GUARANTEED_CAGR, selectedYears) }]
      : group.etfs.map((etf) => ({ name: etf.name, ticker: etf.ticker, portfolioPct: etf.portfolioPct, cagr: etf.cagr, estimatedReturn: calcReturn(etf.cagr, selectedYears) }))
  );

  const portfolioReturn = parseFloat(etfReturnRows.reduce((s, r) => s + (r.portfolioPct / 100) * r.estimatedReturn, 0).toFixed(1));
  const portfolioCagr   = parseFloat(etfReturnRows.reduce((s, r) => s + (r.portfolioPct / 100) * r.cagr, 0).toFixed(1));
  const realCagr        = parseFloat((portfolioCagr - krCpi).toFixed(1));
  const realReturn      = parseFloat(((Math.pow(1 + realCagr / 100, selectedYears) - 1) * 100).toFixed(1));
  const totalInvestment = totalInvestmentInput ? parseFloat(totalInvestmentInput) * 10_000 : null;

  // ── 리밸런싱 계산 ───────────────────────────────────────
  const rebalTotal  = rebalTotalInput ? parseFloat(rebalTotalInput) * 10_000 : null;
  const currentSum  = ASSET_KEYS.reduce((s, k) => s + currentAlloc[k], 0);
  const isValidSum  = Math.abs(currentSum - 100) < 0.1;
  const REBAL_ASSETS = ASSET_LABELS.map((label, i) => ({ key: ASSET_KEYS[i], label, color: COLORS[i] }));
  const rebalRows = REBAL_ASSETS.map((a) => {
    const cur = currentAlloc[a.key]; const tgt = data.allocation[a.key];
    const curAmt = rebalTotal ? rebalTotal * (cur / 100) : null;
    const tgtAmt = rebalTotal ? rebalTotal * (tgt / 100) : null;
    return { ...a, cur, tgt, curAmt, tgtAmt, diff: curAmt !== null && tgtAmt !== null ? tgtAmt - curAmt : null };
  });
  const rebalChartData = rebalRows.map((r) => ({ name: r.label, 현재: r.cur, 목표: r.tgt, color: r.color }));

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">투자전략 플래너</h1>
          <p className="text-sm text-gray-400 mt-0.5">현재 경제지표를 반영한 맞춤 자산 배분 제안</p>
        </div>
        <Link href="/survey" className="text-sm text-blue-500 hover:text-blue-700 border border-blue-300 rounded-full px-4 py-1.5 hover:bg-blue-50 transition-colors">
          재진단
        </Link>
      </div>

      {/* ── 투자자 성향 (항상 표시) ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">나의 투자 성향</p>
        <p className="text-2xl font-bold text-blue-700">{data.riskTypeLabel}</p>
        <p className="text-sm text-blue-600 mt-1 leading-relaxed">{data.riskTypeDesc}</p>
      </div>

      {/* ── 탭 네비게이션 ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              tab === key ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ 탭 1: 자산 배분 ══════════════ */}
      {tab === "allocation" && (
        <>
          {/* 시장 신호 */}
          {data.signals.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">시장 신호</h2>
              {data.signals.map((s) => (
                <div key={s.key} className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 text-sm ${SEVERITY_STYLE[s.severity]}`}>
                  <span>{SEVERITY_ICON[s.severity]}</span>
                  <span className="leading-relaxed">{s.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* 자산 배분 차트 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">추천 자산 배분</h2>
              {hasSignalAdjust && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">시장 신호 반영됨</span>
              )}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-full md:w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={COLORS[ASSET_LABELS.indexOf(chartData[i].name)]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 w-full space-y-3">
                {ASSET_LABELS.map((label, i) => {
                  const cur  = data.allocation[ASSET_KEYS[i]];
                  const base = data.baseAllocation[ASSET_KEYS[i]];
                  const diff = cur - base;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                          <span className="text-sm text-gray-700">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {diff !== 0 && (
                            <span className={`text-xs font-medium ${diff > 0 ? "text-red-500" : "text-blue-500"}`}>
                              {diff > 0 ? `+${diff}%` : `${diff}%`}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-900 w-10 text-right">{cur}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cur}%`, background: COLORS[i] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ 탭 2: ETF 추천 ══════════════ */}
      {tab === "etf" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="font-semibold text-gray-900">ETF 포트폴리오 추천</h2>
            <p className="text-xs text-gray-400 mt-0.5">DC·IRP 퇴직연금 계좌에서 선택 가능한 ETF 기준</p>
          </div>

          <div className="space-y-6">
            {etfGroups.map((group) => (
              <div key={group.assetClass}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: group.color }} />
                  <span className="text-sm font-semibold text-gray-800">{group.label}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: group.color + "1a", color: group.color }}>
                    {group.allocationPct}%
                  </span>
                </div>

                {group.isGuaranteed ? (
                  <div className="ml-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-sm font-medium text-blue-800 mb-1">원리금보장 상품 이용</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      ETF 대신 운용사의 원리금보장 상품(정기예금, GIC, 원리금보장형 ELB 등)을 선택하세요.
                      원금과 이자가 보장되며 예금자보호 한도(5,000만원) 내에서 안전합니다.
                    </p>
                  </div>
                ) : (
                  <div className="ml-4 space-y-2">
                    {group.etfs.map((etf) => (
                      <div key={etf.ticker} className="border border-gray-100 rounded-xl p-3.5 hover:border-gray-200 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-semibold text-gray-800">{etf.name}</span>
                              <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{etf.ticker}</span>
                            </div>
                            <p className="text-xs text-gray-500">{etf.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-base font-bold" style={{ color: group.color }}>{etf.portfolioPct}%</span>
                            <p className="text-[11px] text-gray-400">포트폴리오</p>
                          </div>
                        </div>
                        <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${etf.portfolioPct}%`, background: group.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-5 text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
            위 ETF는 자산군별 대표 상품 예시이며, 실제 운용사 제공 상품과 다를 수 있습니다.
            투자 전 각 ETF의 운용보수, 추적오차, 유동성을 확인하세요.
          </p>
        </div>
      )}

      {/* ══════════════ 탭 3: 수익률 분석 ══════════════ */}
      {tab === "returns" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          {/* 헤더 + 연도 선택 */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">수익률 분석</h2>
              <p className="text-xs text-gray-400 mt-0.5">CAGR 기반 투자 기간별 예상 누적 수익률</p>
            </div>
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
              {YEAR_OPTIONS.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYears(y)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedYears === y ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {y}년
                </button>
              ))}
            </div>
          </div>

          {/* 총투자금 입력 */}
          <div className="mb-5 flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 whitespace-nowrap">총 투자금 (선택)</label>
            <div className="relative flex-1 max-w-xs">
              <input
                type="number" min={1} placeholder="예: 3000" value={totalInvestmentInput}
                onChange={(e) => setTotalInvestmentInput(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">만원</span>
            </div>
            {totalInvestmentInput && (
              <button onClick={() => setTotalInvestmentInput("")} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
            )}
          </div>

          {/* 포트폴리오 전체 요약 카드 */}
          <div className="mb-5 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              포트폴리오 예상 수익률 — {selectedYears}년 기준
            </p>
            {totalInvestment ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">누적 수익률 (명목)</p><p className="text-xl font-bold text-emerald-400">+{portfolioReturn}%</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">수익금</p><p className="text-xl font-bold text-emerald-400">{formatKRW(totalInvestment * portfolioReturn / 100)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">평가금액</p><p className="text-xl font-bold text-white">{((totalInvestment + totalInvestment * portfolioReturn / 100) / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원</p></div>
                </div>
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-700/40 rounded-xl mb-3">
                  <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                  <p className="text-[11px] text-slate-400">
                    실질 수익률 (물가 차감){" "}
                    <span className={`font-bold text-sm ${realReturn >= 0 ? "text-violet-300" : "text-red-400"}`}>{realReturn >= 0 ? "+" : ""}{realReturn}%</span>
                    <span className="ml-2 text-slate-500">= 명목 +{portfolioReturn}% − CPI {krCpi}%</span>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">누적 수익률 (명목)</p><p className="text-3xl font-bold text-emerald-400">+{portfolioReturn}%</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">연평균 수익률 (CAGR)</p><p className="text-3xl font-bold text-emerald-400">+{portfolioCagr}%<span className="text-base font-normal text-slate-400">/년</span></p></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">실질 누적 수익률</p><p className={`text-2xl font-bold ${realReturn >= 0 ? "text-violet-400" : "text-red-400"}`}>{realReturn >= 0 ? "+" : ""}{realReturn}%</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">실질 CAGR</p><p className={`text-2xl font-bold ${realCagr >= 0 ? "text-violet-400" : "text-red-400"}`}>{realCagr >= 0 ? "+" : ""}{realCagr}%<span className="text-base font-normal text-slate-400">/년</span></p></div>
                </div>
              </>
            )}
            <div className="flex items-center justify-between border-t border-slate-700 pt-3 mt-1">
              <p className="text-[11px] text-slate-500">
                {totalInvestment
                  ? `투자원금 ${(totalInvestment / 10_000).toLocaleString("ko-KR")}만원 · CAGR +${portfolioCagr}%/년`
                  : `명목 CAGR +${portfolioCagr}% − 한국 CPI ${krCpi}% = 실질 ${realCagr >= 0 ? "+" : ""}${realCagr}%`}
              </p>
              <span className="text-[10px] text-slate-600 bg-slate-700/60 px-2 py-0.5 rounded-full">추정치</span>
            </div>
          </div>

          {/* ETF별 수익률 테이블 */}
          <div className="space-y-2">
            {etfReturnRows.map((row) => {
              const ret         = row.estimatedReturn;
              const realEtfCagr = parseFloat((row.cagr - krCpi).toFixed(1));
              const realEtfRet  = parseFloat(((Math.pow(1 + realEtfCagr / 100, selectedYears) - 1) * 100).toFixed(1));
              const retColor = ret >= 200 ? "#059669" : ret >= 80 ? "#16a34a" : ret >= 30 ? "#2563eb" : "#6b7280";
              const retBg    = ret >= 200 ? "#d1fae5" : ret >= 80 ? "#dcfce7" : ret >= 30 ? "#dbeafe" : "#f3f4f6";
              return (
                <div key={row.ticker} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{row.name}</span>
                      {row.ticker !== "-" && (
                        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{row.ticker}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      CAGR +{row.cagr}% · 비중 {row.portfolioPct}%
                      <span className="ml-2 text-violet-400">· 실질 CAGR {realEtfCagr >= 0 ? "+" : ""}{realEtfCagr}%</span>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ color: retColor, background: retBg }}>+{ret}%</span>
                    <p className={`text-[10px] mt-0.5 ${realEtfRet >= 0 ? "text-violet-500" : "text-red-400"}`}>
                      실질 {realEtfRet >= 0 ? "+" : ""}{realEtfRet}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
            누적 수익률은 CAGR 기반 복리 추정치이며 실제 수익률과 다를 수 있습니다. 과거 성과는 미래 수익을 보장하지 않습니다.
          </p>
        </div>
      )}

      {/* ══════════════ 탭 4: 리밸런싱 ══════════════ */}
      {tab === "rebalancing" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">리밸런싱 계산기</h2>
              <p className="text-xs text-gray-400 mt-0.5">현재 보유 비중을 입력하면 목표 배분 대비 매수·매도 금액을 계산합니다.</p>
            </div>
            <button
              onClick={() => setCurrentAlloc({ ...data.allocation })}
              className="text-xs text-blue-500 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              목표 배분으로 초기화
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 입력 */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">총 자산 (선택)</label>
                <div className="relative">
                  <input
                    type="number" min={1} placeholder="예: 5000" value={rebalTotalInput}
                    onChange={(e) => setRebalTotalInput(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">만원</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">현재 보유 비중</label>
                  <span className={`text-xs font-medium ${isValidSum ? "text-emerald-500" : "text-amber-500"}`}>
                    합계 {currentSum.toFixed(0)}%{isValidSum ? " ✓" : " (100% 필요)"}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {REBAL_ASSETS.map((a) => (
                    <div key={String(a.key)} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-24 flex-shrink-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }} />
                        <span className="text-sm text-gray-700">{a.label}</span>
                      </div>
                      <div className="flex-1 relative">
                        <AllocInput
                          value={currentAlloc[a.key]}
                          onChange={(v) => setCurrentAlloc((prev) => ({ ...prev, [a.key]: v }))}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                      </div>
                      <div className="w-12 text-right">
                        <span className="text-xs text-gray-400">→ {data.allocation[a.key]}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 결과 */}
            <div className="space-y-4">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rebalChartData} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
                    <Tooltip formatter={((v: number | undefined) => [`${v ?? 0}%`]) as any} />
                    <Bar dataKey="현재" fill="#cbd5e1" radius={[0, 2, 2, 0]} barSize={10} />
                    <Bar dataKey="목표" radius={[0, 2, 2, 0]} barSize={10}>
                      {rebalChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 justify-center mt-1">
                  <div className="flex items-center gap-1 text-xs text-gray-400"><span className="w-2.5 h-2 rounded-sm bg-slate-300" />현재</div>
                  <div className="flex items-center gap-1 text-xs text-gray-400"><span className="w-2.5 h-2 rounded-sm bg-blue-400" />목표</div>
                </div>
              </div>

              {isValidSum && (
                <div className="space-y-2">
                  {rebalRows.filter((r) => r.cur !== r.tgt).map((r) => {
                    const isBuy = r.tgt > r.cur;
                    return (
                      <div key={String(r.key)} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isBuy ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{r.label}</p>
                            <p className="text-[11px] text-gray-400">
                              {r.cur}% → {r.tgt}%
                              {r.curAmt !== null && r.tgtAmt !== null && (
                                <span> ({formatKRW(r.curAmt).replace("+", "")} → {formatKRW(r.tgtAmt).replace("+", "")})</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`text-sm font-bold ${isBuy ? "text-emerald-600" : "text-red-500"}`}>{isBuy ? "매수" : "매도"}</span>
                          {r.diff !== null
                            ? <p className={`text-sm font-bold ${isBuy ? "text-emerald-600" : "text-red-500"}`}>{formatKRW(Math.abs(r.diff)).replace("+", "")}</p>
                            : <p className="text-xs text-gray-400">{Math.abs(r.tgt - r.cur)}%p</p>}
                        </div>
                      </div>
                    );
                  })}
                  {rebalRows.every((r) => r.cur === r.tgt) && (
                    <div className="text-center py-4 text-sm text-emerald-600 font-medium">현재 배분이 목표 배분과 일치합니다.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 면책 고지 ── */}
      <div className="text-xs text-gray-400 text-center leading-relaxed bg-gray-50 rounded-xl p-4">
        본 포트폴리오 제안은 투자 참고용 정보이며, 실제 투자 결과를 보장하지 않습니다.
        모든 투자 결정은 본인의 판단과 책임하에 이루어져야 합니다.
        <br />
        기준 시각: {new Date(data.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
      </div>
    </div>
  );
}
