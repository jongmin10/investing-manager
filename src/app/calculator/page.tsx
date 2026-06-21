"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

type Mode = "accumulate" | "target" | "tax" | "pension";

// ── 복리 계산 ─────────────────────────────────────────────
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

// ── 세액공제 계산 ─────────────────────────────────────────
const TAX_DEDUCTION_LIMIT_MAN = 900;

function calcTaxDeduction(irpMan: number, dcMan: number, grossIncomeMan: number) {
  const totalMan = irpMan + dcMan;
  const deductibleMan = Math.min(totalMan, TAX_DEDUCTION_LIMIT_MAN);
  const rate = grossIncomeMan <= 5500 ? 0.165 : 0.132;
  const deductionWon = deductibleMan * 10_000 * rate;
  const effectiveReturn = totalMan > 0 ? (deductionWon / (totalMan * 10_000)) * 100 : 0;
  return { totalMan, deductibleMan, rate, deductionWon, effectiveReturn };
}

// ── 연금 수령 계산 ────────────────────────────────────────
function calcAnnuityPMT(pv: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return pv / n;
  return pv * r / (1 - Math.pow(1 + r, -n));
}

function getPensionTaxRate(age: number): { rate: number; label: string } {
  if (age >= 80) return { rate: 0.033, label: "3.3% (80세 이상)" };
  if (age >= 70) return { rate: 0.044, label: "4.4% (70~79세)" };
  return { rate: 0.055, label: "5.5% (55~69세)" };
}

function genAnnuityChart(pv: number, annualRate: number, years: number) {
  const monthlyPmt = calcAnnuityPMT(pv, annualRate, years);
  const r = annualRate / 100 / 12;
  let balance = pv;
  return Array.from({ length: years }, (_, i) => {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + r) - monthlyPmt;
    }
    return {
      year: `${i + 1}년`,
      잔액: Math.max(0, Math.round(balance / 10_000)),
    };
  });
}

// ── 공통 유틸 ─────────────────────────────────────────────
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
            className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <span className="text-sm text-gray-500 whitespace-nowrap shrink-0">{unit}</span>
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

  // 적립식
  const [monthly, setMonthly] = useState(50);
  const [years,   setYears]   = useState(20);
  const [rate,    setRate]    = useState(7);

  // 목표 역산
  const [targetMan,   setTargetMan]   = useState(10000);
  const [targetYears, setTargetYears] = useState(20);
  const [targetRate,  setTargetRate]  = useState(7);

  // 세액공제
  const [grossIncome, setGrossIncome] = useState(5000);
  const [irpAmount,   setIrpAmount]   = useState(300);
  const [dcAmount,    setDcAmount]    = useState(0);

  // 연금 수령
  const [pensionFund,   setPensionFund]   = useState(30000); // 만원
  const [pensionAge,    setPensionAge]    = useState(60);
  const [pensionYears,  setPensionYears]  = useState(20);
  const [pensionRate,   setPensionRate]   = useState(3);

  // ── 적립식 계산 ──
  const fv        = useMemo(() => calcFV(monthly * 10_000, rate, years), [monthly, rate, years]);
  const principal = monthly * 10_000 * years * 12;
  const profit    = fv - principal;
  const returnPct = principal > 0 ? (profit / principal) * 100 : 0;
  const chartData = useMemo(() => genYearlyData(monthly * 10_000, rate, years), [monthly, rate, years]);

  // ── 목표 역산 계산 ──
  const neededPMT    = useMemo(() => calcPMT(targetMan * 10_000, targetRate, targetYears), [targetMan, targetRate, targetYears]);
  const neededPMTMan = Math.ceil(neededPMT / 10_000);
  const totalPaid    = neededPMTMan * 10_000 * targetYears * 12;
  const targetProfit = targetMan * 10_000 - totalPaid;
  const targetChart  = useMemo(
    () => genYearlyData(neededPMTMan * 10_000, targetRate, targetYears),
    [neededPMTMan, targetRate, targetYears]
  );

  // ── 세액공제 계산 ──
  const tax = useMemo(
    () => calcTaxDeduction(irpAmount, dcAmount, grossIncome),
    [irpAmount, dcAmount, grossIncome]
  );
  const isOverLimit = irpAmount + dcAmount > TAX_DEDUCTION_LIMIT_MAN;

  // ── 연금 수령 계산 ──
  const pensionPV         = pensionFund * 10_000;
  const monthlyGross      = useMemo(() => calcAnnuityPMT(pensionPV, pensionRate, pensionYears), [pensionPV, pensionRate, pensionYears]);
  const { rate: taxRate, label: taxLabel } = getPensionTaxRate(pensionAge);
  const monthlyTax        = monthlyGross * taxRate;
  const monthlyNet        = monthlyGross - monthlyTax;
  const annualGross       = monthlyGross * 12;
  const annualNet         = monthlyNet * 12;
  const totalReceived     = monthlyNet * pensionYears * 12;
  const isOverAnnualLimit = annualGross > 15_000_000; // 연 1,500만원 초과 시 종합과세 가능
  const annuityChart      = useMemo(
    () => genAnnuityChart(pensionPV, pensionRate, pensionYears),
    [pensionPV, pensionRate, pensionYears]
  );
  // 일시금 vs 연금 비교 (세금 절감액)
  const estimatedLumpTaxRate = 0.22; // 퇴직소득세 추정 (중간 구간)
  const lumpTax   = pensionPV * estimatedLumpTaxRate;
  const annuityTotalTax = monthlyTax * pensionYears * 12;
  const taxSaving = lumpTax - annuityTotalTax;

  const xInterval = (y: number) => Math.max(0, Math.ceil(y / 8) - 1);

  const isAccum   = mode === "accumulate";
  const isTarget  = mode === "target";
  const isTax     = mode === "tax";
  const isPension = mode === "pension";

  const validTarget = neededPMTMan > 0 && neededPMTMan < 10_000;

  const TABS: [Mode, string][] = [
    ["accumulate", "적립식 계산"],
    ["target",     "목표 역산"],
    ["tax",        "세액공제"],
    ["pension",    "연금 수령"],
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-3">

      {/* ── 헤더 + 모드 토글 ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">복리 계산기</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isTax     ? "IRP·DC 납입액으로 연말정산 세액공제 혜택을 계산하세요."
            : isPension ? "적립금을 연금으로 수령할 때 월 수령액과 세금을 시뮬레이션하세요."
            :             "월 투자금과 기간을 설정해 미래 자산을 시뮬레이션하세요."}
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
          {TABS.map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 px-2 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                mode === m ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 적립식 / 목표 역산 ── */}
      {(isAccum || isTarget) && (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[5fr_7fr]">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900">
              {isAccum ? "투자 설정" : "목표 설정"}
            </h2>
            {isAccum ? (
              <>
                <SliderInput label="월 투자금"       value={monthly} onChange={setMonthly} min={10}   max={500}    step={10}  unit="만원" tickLeft="10만원"    tickRight="500만원" />
                <SliderInput label="투자 기간"        value={years}   onChange={setYears}   min={1}    max={40}     step={1}   unit="년"   tickLeft="1년"        tickRight="40년" />
                <SliderInput label="연 수익률 (CAGR)" value={rate}    onChange={setRate}    min={0.5}  max={25}     step={0.5} unit="%"    tickLeft="0.5%"       tickRight="25%" />
              </>
            ) : (
              <>
                <SliderInput label="목표 금액"        value={targetMan}   onChange={setTargetMan}   min={1000} max={100000} step={1000} unit="만원" tickLeft="1,000만원" tickRight="10억원" />
                <SliderInput label="투자 기간"         value={targetYears} onChange={setTargetYears} min={1}    max={40}     step={1}    unit="년"   tickLeft="1년"       tickRight="40년" />
                <SliderInput label="연 수익률 (CAGR)"  value={targetRate}  onChange={setTargetRate}  min={0.5}  max={25}     step={0.5}  unit="%"    tickLeft="0.5%"      tickRight="25%" />
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {isAccum
                  ? `${years}년 후 예상 자산 — 월 ${monthly.toLocaleString()}만원 · 연 ${rate}%`
                  : `필요 월 투자금 — 목표 ${fmt(targetMan * 10_000)} · ${targetYears}년 · 연 ${targetRate}%`}
              </p>
              {isAccum ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">최종 금액</p><p className="text-xl font-bold text-emerald-400">{fmt(fv)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">총 투자금</p><p className="text-xl font-bold text-white">{fmt(principal)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">수익금</p><p className="text-xl font-bold text-emerald-400">+{fmt(profit)}</p></div>
                </div>
              ) : validTarget ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">월 투자금</p><p className="text-xl font-bold text-emerald-400">{fmt(neededPMTMan * 10_000)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">총 납입금</p><p className="text-xl font-bold text-white">{fmt(totalPaid)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">예상 수익금</p><p className="text-xl font-bold text-emerald-400">+{fmt(Math.max(0, targetProfit))}</p></div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">수익률 또는 기간을 조정해주세요.</p>
              )}
              <div className="flex items-center justify-between border-t border-slate-700/60 pt-2 mt-3">
                <p className="text-[11px] text-slate-500">
                  {isAccum
                    ? `수익률 +${returnPct.toFixed(1)}% · 총 ${years * 12}개월 납입`
                    : `목표 ${fmt(targetMan * 10_000)} 달성 시뮬레이션`}
                </p>
                <span className="text-[10px] text-slate-600 bg-slate-700/60 px-2 py-0.5 rounded-full">추정치</span>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl px-5 pt-4 pb-3 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">연도별 자산 성장</p>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200" />원금</div>
                  <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200" />복리 수익</div>
                </div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={isAccum ? chartData : targetChart} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} interval={xInterval(isAccum ? years : targetYears)} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v >= 10_000 ? `${(v / 10_000).toFixed(0)}억` : `${v}만`} width={46} />
                    <Tooltip formatter={((v: number | undefined, name: string) => [`${(v ?? 0).toLocaleString()}만원`, name]) as any} labelStyle={{ fontWeight: 600, fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="원금" stackId="1" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="수익" stackId="1" stroke="#34d399" fill="#d1fae5" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 세액공제 계산기 ── */}
      {isTax && (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[5fr_7fr]">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
            <h2 className="font-semibold text-gray-900">납입 정보</h2>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">총급여</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={1000} max={100000} step={100} value={grossIncome}
                    onChange={(e) => setGrossIncome(Math.max(1000, Number(e.target.value)))}
                    className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap shrink-0">만원</span>
                </div>
              </div>
              <input type="range" min={1000} max={20000} step={100} value={Math.min(grossIncome, 20000)} onChange={(e) => setGrossIncome(Number(e.target.value))} className="w-full accent-blue-500" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1,000만원</span><span>2억원+</span></div>
              <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${grossIncome <= 5500 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: grossIncome <= 5500 ? "#059669" : "#d97706" }} />
                {grossIncome <= 5500 ? "16.5% 공제율 적용 (5,500만원 이하)" : "13.2% 공제율 적용 (5,500만원 초과)"}
              </div>
            </div>

            <SliderInput label="IRP 납입액 (연간)"    value={irpAmount} onChange={setIrpAmount} min={0} max={900} step={50} unit="만원" tickLeft="0" tickRight="900만원" />
            <SliderInput label="DC 추가납입액 (연간)" value={dcAmount}  onChange={setDcAmount}  min={0} max={900} step={50} unit="만원" tickLeft="0" tickRight="900만원" />

            {isOverLimit && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                ⚠ IRP+DC 합산 공제 한도는 <strong>연 900만원</strong>입니다.
                초과분({(irpAmount + dcAmount - TAX_DEDUCTION_LIMIT_MAN).toLocaleString()}만원)은 공제되지 않습니다.
              </div>
            )}
            <p className="text-[11px] text-gray-400 leading-relaxed pt-1 border-t border-gray-100">
              DC형 가입자는 회사 부담금 외 <strong>본인 추가납입분</strong>만 세액공제 대상입니다. IRP와 DC 추가납입 합산 연 900만원 한도 적용.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">2024년 연말정산 세액공제 예상액</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">환급받는 세금</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">
                    {tax.deductionWon >= 10_000 ? `${(tax.deductionWon / 10_000).toFixed(1)}만원` : `${Math.round(tax.deductionWon).toLocaleString()}원`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">첫해 실효 수익률</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">+{tax.effectiveReturn.toFixed(1)}%</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-700 pt-3">
                <div><p className="text-[11px] text-slate-500 mb-0.5">총 납입액</p><p className="text-sm font-semibold text-slate-300">{tax.totalMan.toLocaleString()}만원</p></div>
                <div><p className="text-[11px] text-slate-500 mb-0.5">공제 대상액</p><p className="text-sm font-semibold text-slate-300">{tax.deductibleMan.toLocaleString()}만원</p></div>
                <div><p className="text-[11px] text-slate-500 mb-0.5">적용 공제율</p><p className="text-sm font-semibold text-slate-300">{(tax.rate * 100).toFixed(1)}%</p></div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">소득 구간별 공제율</h3>
              <div className="space-y-3">
                {[
                  { label: "총급여 5,500만원 이하", rate: 16.5, max: 148.5, active: grossIncome <= 5500 },
                  { label: "총급여 5,500만원 초과", rate: 13.2, max: 118.8, active: grossIncome > 5500 },
                ].map((row) => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${row.active ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100"}`}>
                    <div>
                      <p className={`text-sm font-medium ${row.active ? "text-blue-800" : "text-gray-500"}`}>
                        {row.label}
                        {row.active && <span className="ml-2 text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">현재</span>}
                      </p>
                      <p className={`text-xs mt-0.5 ${row.active ? "text-blue-600" : "text-gray-400"}`}>최대 {row.max}만원 환급</p>
                    </div>
                    <span className={`text-xl font-bold ${row.active ? "text-blue-700" : "text-gray-300"}`}>{row.rate}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600">공제 한도 활용률</span>
                  <span className="text-xs text-gray-500">{Math.min(tax.totalMan, TAX_DEDUCTION_LIMIT_MAN).toLocaleString()} / {TAX_DEDUCTION_LIMIT_MAN}만원</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? "bg-amber-400" : "bg-blue-500"}`} style={{ width: `${Math.min((tax.totalMan / TAX_DEDUCTION_LIMIT_MAN) * 100, 100)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>0</span>
                  <span className={isOverLimit ? "text-amber-500 font-medium" : ""}>{Math.round((tax.totalMan / TAX_DEDUCTION_LIMIT_MAN) * 100)}% 활용{tax.totalMan < TAX_DEDUCTION_LIMIT_MAN && ` · ${TAX_DEDUCTION_LIMIT_MAN - tax.totalMan}만원 여유`}</span>
                  <span>900만원</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 연금 수령 시뮬레이션 ── */}
      {isPension && (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[5fr_7fr]">
          {/* 왼쪽: 입력 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900">수령 조건 설정</h2>
            <SliderInput label="예상 적립금"        value={pensionFund}  onChange={setPensionFund}  min={1000}  max={200000} step={1000} unit="만원" tickLeft="1,000만원" tickRight="20억원" />
            <SliderInput label="수령 시작 나이"      value={pensionAge}   onChange={setPensionAge}   min={55}    max={80}     step={1}    unit="세"   tickLeft="55세"      tickRight="80세" />
            <SliderInput label="수령 기간"           value={pensionYears} onChange={setPensionYears} min={5}     max={30}     step={1}    unit="년"   tickLeft="5년"       tickRight="30년" />
            <SliderInput label="연금 운용 수익률"    value={pensionRate}  onChange={setPensionRate}  min={0}     max={7}      step={0.5}  unit="%"    tickLeft="0%"        tickRight="7%" />

            {/* 연금소득세율 안내 */}
            <div className="pt-1 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-gray-500">연금소득세율 (분리과세)</p>
              {[
                { range: "55~69세", rate: "5.5%", active: pensionAge < 70 },
                { range: "70~79세", rate: "4.4%", active: pensionAge >= 70 && pensionAge < 80 },
                { range: "80세 이상", rate: "3.3%", active: pensionAge >= 80 },
              ].map((row) => (
                <div key={row.range} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${row.active ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-400"}`}>
                  <span>{row.range}</span>
                  <span>{row.rate}</span>
                  {row.active && <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">현재</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 결과 */}
          <div className="space-y-3">
            {/* 메인 결과 카드 */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {pensionAge}세부터 {pensionYears}년 수령 — {fmt(pensionFund * 10_000)} 적립금 · 연 {pensionRate}% 운용
              </p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">월 수령액 (세후)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{fmt(monthlyNet)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">세전 {fmt(monthlyGross)}<br />세금 {fmt(monthlyTax)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">연간 수령액 (세후)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{fmt(annualNet)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">총 {fmt(totalReceived)} 수령</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-700 pt-3">
                <div><p className="text-[11px] text-slate-500 mb-0.5">적용 세율</p><p className="text-sm font-semibold text-slate-300">{taxLabel}</p></div>
                <div><p className="text-[11px] text-slate-500 mb-0.5">수령 기간</p><p className="text-sm font-semibold text-slate-300">{pensionYears}년 ({pensionYears * 12}회)</p></div>
                <div><p className="text-[11px] text-slate-500 mb-0.5">세후 총 수령</p><p className="text-sm font-semibold text-slate-300">{fmt(totalReceived)}</p></div>
              </div>
              {isOverAnnualLimit && (
                <div className="mt-3 px-3 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                  ⚠ 연간 수령액이 1,500만원 초과 시 종합과세 또는 16.5% 분리과세 선택 적용됩니다.
                </div>
              )}
            </div>

            {/* 일시금 vs 연금 세금 비교 */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">일시금 vs 연금 수령 비교</h3>
              <p className="text-[11px] text-gray-400 mb-4">동일 적립금 기준 세금 부담 비교 (퇴직소득세 추정 22%)</p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: "일시금 수령", 세금: Math.round(lumpTax / 10_000), color: "#ef4444" },
                      { name: "연금 수령", 세금: Math.round(annuityTotalTax / 10_000), color: "#3b82f6" },
                    ]}
                    layout="vertical"
                    margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}만`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={72} />
                    <Tooltip formatter={((v: number | undefined) => [`${(v ?? 0).toLocaleString()}만원`, "납부 세금"]) as any} />
                    <Bar dataKey="세금" radius={[0, 4, 4, 0]}>
                      {[{ color: "#ef4444" }, { color: "#3b82f6" }].map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {taxSaving > 0 && (
                <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-emerald-600 text-lg">✓</span>
                  <p className="text-xs text-emerald-800">
                    연금 수령 시 일시금 대비 <strong>{fmt(taxSaving)}</strong> 세금 절감 추정
                  </p>
                </div>
              )}
            </div>

            {/* 잔액 추이 차트 */}
            <div className="bg-white border border-gray-200 rounded-2xl px-5 pt-4 pb-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-3">연도별 잔액 추이</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={annuityChart} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={xInterval(pensionYears)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 10_000 ? `${(v / 10_000).toFixed(0)}억` : `${v}만`} width={46} />
                    <Tooltip formatter={((v: number | undefined) => [`${(v ?? 0).toLocaleString()}만원`, "잔액"]) as any} labelStyle={{ fontWeight: 600, fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="잔액" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-1">
        {isTax
          ? "세액공제액은 소득세 기준 추정치입니다. 지방소득세 포함 여부, 과세표준에 따라 실제 환급액이 다를 수 있습니다."
          : isPension
          ? "연금소득세는 분리과세 기준 추정치입니다. 연 1,500만원 초과 시 종합과세 대상이 될 수 있으며, 실제 세금은 다를 수 있습니다."
          : "복리 원리 기반 시뮬레이션 · 실제 투자 결과와 다를 수 있습니다."}
      </p>
    </div>
  );
}
