"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Mode = "accumulate" | "target";

const SCENARIOS = [
  { label: "안정형", sub: "채권 중심", rate: 3,  color: "#10b981", bg: "#d1fae5", text: "text-emerald-600" },
  { label: "중립형", sub: "균형 배분", rate: 7,  color: "#3b82f6", bg: "#dbeafe", text: "text-blue-600" },
  { label: "공격형", sub: "주식 중심", rate: 12, color: "#ef4444", bg: "#fee2e2", text: "text-red-500" },
];

function calcFV(monthlyPmt: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlyPmt * n;
  return monthlyPmt * ((Math.pow(1 + r, n) - 1) / r);
}

function calcPMT(targetFV: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return targetFV / n;
  return targetFV * r / (Math.pow(1 + r, n) - 1);
}

function genYearlyData(monthlyPmt: number, annualRate: number, years: number) {
  const r = annualRate / 100 / 12;
  return Array.from({ length: years }, (_, i) => {
    const n = (i + 1) * 12;
    const fv = r === 0 ? monthlyPmt * n : monthlyPmt * ((Math.pow(1 + r, n) - 1) / r);
    const principal = monthlyPmt * n;
    return {
      year: `${i + 1}년`,
      원금: Math.round(principal / 10_000),
      수익: Math.round((fv - principal) / 10_000),
    };
  });
}

function fmt(won: number): string {
  const abs = Math.abs(won);
  if (abs >= 100_000_000) return `${(won / 100_000_000).toFixed(1)}억원`;
  if (abs >= 10_000)      return `${(won / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원`;
  return `${won.toLocaleString("ko-KR")}원`;
}

function SliderInput({
  label, value, onChange, min, max, step, unit, tickLeft, tickRight,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string;
  tickLeft: string; tickRight: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number" min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <span className="text-sm text-gray-500 w-6">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{tickLeft}</span><span>{tickRight}</span>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const [mode, setMode] = useState<Mode>("accumulate");

  // 적립식 inputs
  const [monthly, setMonthly] = useState(50);
  const [years,   setYears]   = useState(20);
  const [rate,    setRate]    = useState(7);

  // 목표 역산 inputs
  const [targetMan,   setTargetMan]   = useState(10000);
  const [targetYears, setTargetYears] = useState(20);
  const [targetRate,  setTargetRate]  = useState(7);

  // ── 적립식 계산 ──
  const fv        = useMemo(() => calcFV(monthly * 10_000, rate, years), [monthly, rate, years]);
  const principal = monthly * 10_000 * years * 12;
  const profit    = fv - principal;
  const returnPct = principal > 0 ? (profit / principal) * 100 : 0;
  const chartData = useMemo(() => genYearlyData(monthly * 10_000, rate, years), [monthly, rate, years]);

  // ── 목표 역산 계산 ──
  const neededPMT     = useMemo(() => calcPMT(targetMan * 10_000, targetRate, targetYears), [targetMan, targetRate, targetYears]);
  const neededPMTMan  = Math.ceil(neededPMT / 10_000);
  const totalPaid     = neededPMTMan * 10_000 * targetYears * 12;
  const targetProfit  = targetMan * 10_000 - totalPaid;
  const targetChart   = useMemo(
    () => genYearlyData(neededPMTMan * 10_000, targetRate, targetYears),
    [neededPMTMan, targetRate, targetYears]
  );

  // ── 시나리오 비교 ──
  const scenarios = useMemo(() =>
    SCENARIOS.map((s) => {
      const fv = calcFV(monthly * 10_000, s.rate, years);
      const p  = monthly * 10_000 * years * 12;
      return { ...s, fv, profit: fv - p };
    }),
    [monthly, years]
  );

  const xInterval = (y: number) => Math.max(0, Math.ceil(y / 8) - 1);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">복리 계산기</h1>
        <p className="text-sm text-gray-400 mt-0.5">월 투자금과 기간을 설정해 미래 자산을 시뮬레이션하세요.</p>
      </div>

      {/* 모드 토글 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([["accumulate", "적립식 계산"], ["target", "목표 역산"]] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === m ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "accumulate" ? (
        <>
          {/* 입력 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
            <h2 className="font-semibold text-gray-900">투자 설정</h2>
            <SliderInput label="월 투자금"       value={monthly} onChange={setMonthly} min={10}  max={500}  step={10}  unit="만원" tickLeft="10만원"  tickRight="500만원" />
            <SliderInput label="투자 기간"        value={years}   onChange={setYears}   min={1}   max={40}   step={1}   unit="년"   tickLeft="1년"      tickRight="40년" />
            <SliderInput label="연 수익률 (CAGR)" value={rate}    onChange={setRate}    min={0.5} max={25}   step={0.5} unit="%"    tickLeft="0.5%"     tickRight="25%" />
          </div>

          {/* 결과 요약 */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              {years}년 후 예상 자산 — 월 {monthly.toLocaleString()}만원 · 연 {rate}%
            </p>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">최종 금액</p>
                <p className="text-2xl font-bold text-emerald-400">{fmt(fv)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">총 투자금</p>
                <p className="text-2xl font-bold text-white">{fmt(principal)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">수익금</p>
                <p className="text-2xl font-bold text-emerald-400">+{fmt(profit)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-700 pt-3">
              <p className="text-[11px] text-slate-500">
                수익률 +{returnPct.toFixed(1)}% · 총 {years * 12}개월 납입
              </p>
              <span className="text-[10px] text-slate-600 bg-slate-700/60 px-2 py-0.5 rounded-full">추정치</span>
            </div>
          </div>

          {/* 차트 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-1">연도별 자산 성장</h2>
            <p className="text-xs text-gray-400 mb-5">원금과 복리 수익의 누적 추이</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={xInterval(years)} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v >= 10_000 ? `${(v / 10_000).toFixed(0)}억` : `${v}만`}
                    width={48}
                  />
                  <Tooltip formatter={(v: number, name: string) => [`${v.toLocaleString()}만원`, name]} labelStyle={{ fontWeight: 600 }} />
                  <Area type="monotone" dataKey="원금" stackId="1" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="수익" stackId="1" stroke="#34d399" fill="#d1fae5" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex gap-4 justify-center">
              <div className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-blue-200" />원금</div>
              <div className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-emerald-200" />복리 수익</div>
            </div>
          </div>

          {/* 시나리오 비교 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-1">시나리오 비교</h2>
            <p className="text-xs text-gray-400 mb-5">
              월 {monthly.toLocaleString()}만원 · {years}년 납입 기준 — 수익률별 최종 자산 비교
            </p>
            <div className="space-y-3">
              {scenarios.map((s) => {
                const isActive = s.rate === rate;
                return (
                  <div
                    key={s.label}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
                      isActive ? "border-blue-300 bg-blue-50/50" : "border-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{s.label}</span>
                        <span className="ml-2 text-xs text-gray-400">{s.sub} · 연 {s.rate}%</span>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-semibold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">현재 설정</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${s.text}`}>{fmt(s.fv)}</p>
                      <p className="text-[11px] text-gray-400">수익 +{fmt(s.profit)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 목표 역산 입력 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
            <h2 className="font-semibold text-gray-900">목표 설정</h2>
            <SliderInput label="목표 금액"        value={targetMan}   onChange={setTargetMan}   min={1000}  max={100000} step={1000} unit="만원" tickLeft="1,000만원" tickRight="10억원" />
            <SliderInput label="투자 기간"         value={targetYears} onChange={setTargetYears} min={1}     max={40}     step={1}    unit="년"   tickLeft="1년"       tickRight="40년" />
            <SliderInput label="연 수익률 (CAGR)"  value={targetRate}  onChange={setTargetRate}  min={0.5}   max={25}     step={0.5}  unit="%"    tickLeft="0.5%"      tickRight="25%" />
          </div>

          {/* 목표 역산 결과 */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              필요 월 투자금 — 목표 {fmt(targetMan * 10_000)} · {targetYears}년 · 연 {targetRate}%
            </p>
            {neededPMTMan > 0 && neededPMTMan < 10_000 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-[11px] text-slate-400 mb-0.5">월 투자금</p>
                    <p className="text-2xl font-bold text-emerald-400">{fmt(neededPMTMan * 10_000)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 mb-0.5">총 납입금</p>
                    <p className="text-2xl font-bold text-white">{fmt(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 mb-0.5">예상 수익금</p>
                    <p className="text-2xl font-bold text-emerald-400">+{fmt(Math.max(0, targetProfit))}</p>
                  </div>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-[11px] text-slate-500">목표 {fmt(targetMan * 10_000)} 달성 시뮬레이션 · 추정치</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">수익률 또는 기간을 조정해주세요.</p>
            )}
          </div>

          {/* 목표 역산 차트 */}
          {neededPMTMan > 0 && neededPMTMan < 10_000 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-1">연도별 자산 성장</h2>
              <p className="text-xs text-gray-400 mb-5">월 {fmt(neededPMTMan * 10_000)} 납입 기준</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={targetChart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={xInterval(targetYears)} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v >= 10_000 ? `${(v / 10_000).toFixed(0)}억` : `${v}만`}
                      width={48}
                    />
                    <Tooltip formatter={(v: number, name: string) => [`${v.toLocaleString()}만원`, name]} labelStyle={{ fontWeight: 600 }} />
                    <Area type="monotone" dataKey="원금" stackId="1" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="수익" stackId="1" stroke="#34d399" fill="#d1fae5" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex gap-4 justify-center">
                <div className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-blue-200" />원금</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-3 h-3 rounded-sm bg-emerald-200" />복리 수익</div>
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-gray-400 text-center leading-relaxed pb-2">
        본 계산기는 복리 원리에 기반한 시뮬레이션 도구입니다. 실제 투자 결과와 다를 수 있으며 투자 결정의 근거로 사용하지 마세요.
      </p>
    </div>
  );
}
