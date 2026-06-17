"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Allocation, MarketSignal, RiskType, EtfGroup, getEtfRecommendations } from "@/lib/portfolio";

interface PortfolioData {
  riskType: RiskType;
  riskTypeLabel: string;
  riskTypeDesc: string;
  allocation: Allocation;
  baseAllocation: Allocation;
  signals: MarketSignal[];
  indicators: {
    vix: number;
    cpi: number;
    usCpi: number;
    cli: number;
    sp500Change: number;
  };
  updatedAt: string;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const ASSET_LABELS = ["원리금보장", "채권형", "혼합형", "주식형"];

const SEVERITY_STYLE: Record<string, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  danger:  "bg-red-50 border-red-300 text-red-800",
};

const SEVERITY_ICON: Record<string, string> = {
  info: "💡", warning: "⚠️", danger: "🚨",
};

function allocationToChart(alloc: Allocation) {
  return [
    { name: "원리금보장", value: alloc.guaranteed },
    { name: "채권형",     value: alloc.bond },
    { name: "혼합형",     value: alloc.mixed },
    { name: "주식형",     value: alloc.equity },
  ].filter((d) => d.value > 0);
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => {
        if (r.status === 401) { setNoProfile(true); setLoading(false); return null; }
        if (r.status === 404) { setNoProfile(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (d && d.allocation) { setData(d); setLoading(false); }
        else if (d) { setNoProfile(true); setLoading(false); }
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">포트폴리오를 분석하는 중...</p>
      </div>
    );
  }

  if (noProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <p className="text-gray-600 text-lg font-medium">아직 투자 성향 진단을 하지 않으셨어요.</p>
        <p className="text-gray-400 text-sm">5가지 질문으로 맞춤 포트폴리오를 제안해드립니다.</p>
        <Link
          href="/survey"
          className="mt-2 bg-blue-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-blue-600 transition-colors"
        >
          성향 진단 시작하기 →
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const chartData = allocationToChart(data.allocation);
  const baseChartData = allocationToChart(data.baseAllocation);
  const hasSignalAdjust = data.signals.some((s) => s.allocationAdjust);
  const etfGroups = getEtfRecommendations(data.riskType, data.allocation);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 포트폴리오</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            현재 경제지표를 반영한 맞춤 자산 배분 제안
          </p>
        </div>
        <Link
          href="/survey"
          className="text-sm text-blue-500 hover:text-blue-700 border border-blue-300 rounded-full px-4 py-1.5 hover:bg-blue-50 transition-colors"
        >
          재진단
        </Link>
      </div>

      {/* 투자자 성향 */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">나의 투자 성향</p>
        <p className="text-2xl font-bold text-blue-700">{data.riskTypeLabel}</p>
        <p className="text-sm text-blue-600 mt-1 leading-relaxed">{data.riskTypeDesc}</p>
      </div>

      {/* 리밸런싱 신호 */}
      {data.signals.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">시장 신호</h2>
          {data.signals.map((s) => (
            <div
              key={s.key}
              className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 text-sm ${SEVERITY_STYLE[s.severity]}`}
            >
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
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              시장 신호 반영됨
            </span>
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
            {[
              { label: "원리금보장", cur: data.allocation.guaranteed, base: data.baseAllocation.guaranteed, color: COLORS[0] },
              { label: "채권형",     cur: data.allocation.bond,       base: data.baseAllocation.bond,       color: COLORS[1] },
              { label: "혼합형",     cur: data.allocation.mixed,      base: data.baseAllocation.mixed,      color: COLORS[2] },
              { label: "주식형",     cur: data.allocation.equity,     base: data.baseAllocation.equity,     color: COLORS[3] },
            ].map(({ label, cur, base, color }) => {
              const diff = cur - base;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
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
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${cur}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ETF 포트폴리오 추천 */}
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
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: group.color + "1a", color: group.color }}
                >
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
                  {group.etfs.map((etf) => {
                    const ret = etf.cumulativeReturn;
                    const retColor = ret >= 200 ? "#059669" : ret >= 80 ? "#16a34a" : ret >= 30 ? "#2563eb" : "#6b7280";
                    const retBg   = ret >= 200 ? "#d1fae5" : ret >= 80 ? "#dcfce7" : ret >= 30 ? "#dbeafe" : "#f3f4f6";
                    return (
                      <div key={etf.ticker} className="border border-gray-100 rounded-xl p-3.5 hover:border-gray-200 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-semibold text-gray-800">{etf.name}</span>
                              <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                                {etf.ticker}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">{etf.description}</p>
                            {/* 수익률 지표 행 */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* 토탈 수익률 */}
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                                style={{ color: retColor, background: retBg }}
                              >
                                토탈 +{ret}%
                              </span>
                              {/* 연평균(CAGR) */}
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                                style={{ color: retColor, borderColor: retBg, background: "transparent" }}
                              >
                                연평균 +{etf.cagr}%
                              </span>
                              {/* 기간 */}
                              <span className="text-[10px] text-gray-400">{etf.returnPeriod}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-base font-bold" style={{ color: group.color }}>
                              {etf.portfolioPct}%
                            </span>
                            <p className="text-[11px] text-gray-400">포트폴리오</p>
                          </div>
                        </div>
                        <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${etf.portfolioPct}%`, background: group.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="mt-5 text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
          위 ETF는 자산군별 대표 상품 예시이며, 실제 운용사 제공 상품과 다를 수 있습니다.
          투자 전 각 ETF의 운용보수, 추적오차, 유동성을 확인하세요.
          <br />
          <span className="text-[10px] text-gray-300">
            누적 수익률은 기초지수 성과 기반 추정치(KRW 환산 포함)이며 실제 ETF 수익률과 다를 수 있습니다. 과거 성과는 미래 수익을 보장하지 않습니다.
          </span>
        </p>
      </div>

      {/* 면책 고지 */}
      <div className="text-xs text-gray-400 text-center leading-relaxed bg-gray-50 rounded-xl p-4">
        본 포트폴리오 제안은 투자 참고용 정보이며, 실제 투자 결과를 보장하지 않습니다.
        모든 투자 결정은 본인의 판단과 책임하에 이루어져야 합니다.
        <br />
        기준 시각: {new Date(data.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
      </div>
    </div>
  );
}
