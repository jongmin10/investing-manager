"use client";

import { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from "recharts";

type Mode = "accumulate" | "target" | "tax" | "pension" | "roadmap";

// ── 복리 시뮬레이션 (월 단위) ─────────────────────────────
//  seedWon  : 기존 적립금/초기 일시금
//  stepUpPct: 매년 납입액 증액률(%) — 급여 상승 반영
//  terPct   : 연 운용보수(TER, %) — 수익률에서 차감
type SimRow = { year: string; 원금: number; 수익: number };
function simulate(
  seedWon: number, monthlyPmt: number, annualRate: number, years: number,
  stepUpPct = 0, terPct = 0,
): { fv: number; principal: number; yearly: SimRow[] } {
  const r = (annualRate - terPct) / 100 / 12; // 보수 차감 후 월 수익률
  const g = stepUpPct / 100;
  let balance = seedWon;
  let principal = seedWon;
  const yearly: SimRow[] = [];
  for (let y = 0; y < years; y++) {
    const pmt = monthlyPmt * Math.pow(1 + g, y); // 해당 연도 월 납입액
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + r) + pmt;
      principal += pmt;
    }
    yearly.push({
      year: `${y + 1}년`,
      원금: Math.round(principal / 10_000),
      수익: Math.round((balance - principal) / 10_000),
    });
  }
  return { fv: balance, principal, yearly };
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

// ── 연금 로드맵 (적립기 → 수령기 통합 타임라인) ───────────
type RoadRow = { age: number; 적립자산: number | null; 수령잔액: number | null };
function genRoadmap(
  currentAge: number, retireAge: number, seedWon: number, monthlyPmt: number,
  accRate: number, stepUpPct: number, terPct: number,
  withdrawYears: number, withdrawRate: number,
): { data: RoadRow[]; peak: number; grossMonthly: number; depletionAge: number } {
  const accYears = Math.max(0, retireAge - currentAge);
  const rAcc = (accRate - terPct) / 100 / 12;
  const g = stepUpPct / 100;
  const data: RoadRow[] = [];
  let bal = seedWon;
  data.push({ age: currentAge, 적립자산: Math.round(bal / 10_000), 수령잔액: null });
  for (let y = 0; y < accYears; y++) {
    const pmt = monthlyPmt * Math.pow(1 + g, y);
    for (let m = 0; m < 12; m++) bal = bal * (1 + rAcc) + pmt;
    data.push({ age: currentAge + y + 1, 적립자산: Math.round(bal / 10_000), 수령잔액: null });
  }
  const peak = bal;
  // 경계점(은퇴 시점)에 수령잔액도 채워 두 영역을 연결
  if (data.length) data[data.length - 1].수령잔액 = Math.round(peak / 10_000);
  // 수령기
  const rW = withdrawRate / 100 / 12;
  const n = withdrawYears * 12;
  const grossMonthly = rW === 0 ? peak / n : peak * rW / (1 - Math.pow(1 + rW, -n));
  let wbal = peak;
  for (let w = 0; w < withdrawYears; w++) {
    for (let m = 0; m < 12; m++) wbal = wbal * (1 + rW) - grossMonthly;
    data.push({ age: retireAge + w + 1, 적립자산: null, 수령잔액: Math.round(Math.max(0, wbal) / 10_000) });
  }
  return { data, peak, grossMonthly, depletionAge: retireAge + withdrawYears };
}

// ── 공통 유틸 ─────────────────────────────────────────────
function fmt(won: number): string {
  const abs = Math.abs(won);
  if (abs >= 100_000_000) return `${(won / 100_000_000).toFixed(1)}억원`;
  if (abs >= 10_000)      return `${(won / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원`;
  return `${won.toLocaleString("ko-KR")}원`;
}

// 숫자 입력칸: 편집 중에는 원시 문자열을 유지(자유 편집 허용), 범위 클램핑은 blur에서만 적용
function NumberField({
  value, onChange, min, max, step, className,
}: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw === "") return; // 비우는 중 — 계산값 유지
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= min && n <= max) onChange(n); // 유효 범위 내일 때만 즉시 반영
  };
  const handleBlur = () => {
    const n = Number(text);
    const next = text === "" || Number.isNaN(n) ? min : Math.min(max, Math.max(min, n));
    onChange(next);
    setText(String(next));
  };

  return (
    <input
      type="number" min={min} max={max} step={step} value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  );
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
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-1.5">
          <NumberField
            value={value} onChange={onChange} min={min} max={max} step={step}
            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <span className="text-sm text-gray-500 whitespace-nowrap shrink-0">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-[11px] text-gray-400 mt-0.5">
        <span>{tickLeft}</span><span>{tickRight}</span>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const [mode, setMode] = useState<Mode>("accumulate");

  // 적립식
  const [seed,    setSeed]    = useState(0); // 기존 적립금(만원)
  const [monthly, setMonthly] = useState(50);
  const [years,   setYears]   = useState(20);
  const [rate,    setRate]    = useState(7);

  // 공통(적립식·목표역산): 납입 증액 + 운용보수
  const [stepUp, setStepUp] = useState(0); // 매년 납입 증액률(%)
  const [ter,    setTer]    = useState(0); // 연 운용보수 TER(%)

  // 목표 역산
  const [targetSeed,  setTargetSeed]  = useState(0); // 기존 적립금(만원)
  const [targetMan,   setTargetMan]   = useState(10000);
  const [targetYears, setTargetYears] = useState(20);
  const [targetRate,  setTargetRate]  = useState(7);

  // 세액공제
  const [grossIncome, setGrossIncome] = useState(5000);
  const [irpAmount,   setIrpAmount]   = useState(300);
  const [dcAmount,    setDcAmount]    = useState(0);
  const [reinvestYears, setReinvestYears] = useState(10); // 환급금 재투자 기간
  const [reinvestRate,  setReinvestRate]  = useState(6);  // 환급금 재투자 수익률

  // 연금 수령
  const [pensionFund,   setPensionFund]   = useState(30000); // 만원
  const [pensionAge,    setPensionAge]    = useState(60);
  const [pensionYears,  setPensionYears]  = useState(20);
  const [pensionRate,   setPensionRate]   = useState(3);

  // 연금 로드맵 (적립기 → 수령기 통합)
  const [roadCurrentAge,   setRoadCurrentAge]   = useState(40);
  const [roadRetireAge,    setRoadRetireAge]    = useState(60);
  const [roadSeed,         setRoadSeed]         = useState(5000);  // 만원
  const [roadMonthly,      setRoadMonthly]      = useState(50);    // 만원
  const [roadAccRate,      setRoadAccRate]      = useState(7);
  const [roadWithdrawYears, setRoadWithdrawYears] = useState(25);
  const [roadWithdrawRate, setRoadWithdrawRate] = useState(3);

  // 인플레이션 (실질가치 환산용)
  const [inflation, setInflation] = useState(2.5);
  const realValue = (nominal: number, yrs: number) => nominal / Math.pow(1 + inflation / 100, yrs);

  // 탭 연결: 적립 결과를 연금 수령으로 이어보기
  const [linkedFrom, setLinkedFrom] = useState<null | "accumulate" | "target">(null);
  const linkToPension = (fundWon: number, from: "accumulate" | "target") => {
    setPensionFund(Math.min(200_000, Math.max(1_000, Math.round(fundWon / 10_000))));
    setLinkedFrom(from);
    setMode("pension");
  };

  // ── 적립식 계산 ──
  const seedWon   = seed * 10_000;
  const sim       = useMemo(() => simulate(seedWon, monthly * 10_000, rate, years, stepUp, ter), [seedWon, monthly, rate, years, stepUp, ter]);
  const fv        = sim.fv;
  const principal = sim.principal;
  const profit    = fv - principal;
  const returnPct = principal > 0 ? (profit / principal) * 100 : 0;
  const chartData = sim.yearly;

  // ── 목표 역산 계산 ──
  // FV는 월 납입액에 대해 선형 → (목표 - 시드성장분) / 단위납입factor 로 역산 (step-up·TER 포함)
  const targetSeedWon = targetSeed * 10_000;
  const targetWon     = targetMan * 10_000;
  const seedFVt       = useMemo(() => simulate(targetSeedWon, 0, targetRate, targetYears, 0, ter).fv, [targetSeedWon, targetRate, targetYears, ter]);
  const pmtFactor     = useMemo(() => simulate(0, 1, targetRate, targetYears, stepUp, ter).fv, [targetRate, targetYears, stepUp, ter]);
  const neededPMT     = pmtFactor > 0 ? Math.max(0, (targetWon - seedFVt) / pmtFactor) : 0;
  const neededPMTMan  = Math.ceil(neededPMT / 10_000);
  const targetSim     = useMemo(() => simulate(targetSeedWon, neededPMTMan * 10_000, targetRate, targetYears, stepUp, ter), [targetSeedWon, neededPMTMan, targetRate, targetYears, stepUp, ter]);
  const totalPaid     = targetSim.principal - targetSeedWon; // 시드 제외 실제 납입액
  const targetProfit  = targetSim.fv - targetSim.principal;
  const seedSuffices  = neededPMT === 0 && targetSeedWon > 0; // 기존 적립금만으로 목표 달성
  const targetChart   = targetSim.yearly;

  // ── 세액공제 계산 ──
  const tax = useMemo(
    () => calcTaxDeduction(irpAmount, dcAmount, grossIncome),
    [irpAmount, dcAmount, grossIncome]
  );
  const isOverLimit = irpAmount + dcAmount > TAX_DEDUCTION_LIMIT_MAN;

  // ── 환급금 재투자 복리 효과 ──
  // 매년 받는 세액공제 환급금을 연 단위로 재투자(매년 말 납입) 했을 때
  const reinvestSum = tax.deductionWon * reinvestYears; // 단순 누적
  const reinvestFV  = reinvestRate === 0
    ? reinvestSum
    : tax.deductionWon * ((Math.pow(1 + reinvestRate / 100, reinvestYears) - 1) / (reinvestRate / 100));
  const reinvestProfit = reinvestFV - reinvestSum;

  // ── 연금 수령 계산 ──
  const pensionPV         = pensionFund * 10_000;
  const monthlyGross      = useMemo(() => calcAnnuityPMT(pensionPV, pensionRate, pensionYears), [pensionPV, pensionRate, pensionYears]);
  const { rate: taxRate, label: taxLabel } = getPensionTaxRate(pensionAge);
  const annualGross       = monthlyGross * 12;
  // 연금소득세: 연 1,500만원 이하면 저율 분리과세(3.3~5.5%),
  // 초과하면 "전액"에 대해 16.5% 분리과세(또는 종합과세) 선택 — 초과분만이 아니라 전액
  const PENSION_SEP_LIMIT = 15_000_000;
  const isOverAnnualLimit = annualGross > PENSION_SEP_LIMIT;
  const effTaxRate        = isOverAnnualLimit ? 0.165 : taxRate;
  const effTaxLabel       = isOverAnnualLimit ? "16.5% (1,500만원 초과 분리과세)" : taxLabel;
  const annualTax         = annualGross * effTaxRate;
  const monthlyTax        = annualTax / 12;
  const monthlyNet        = monthlyGross - monthlyTax;
  const annualNet         = annualGross - annualTax;
  const totalReceived     = monthlyNet * pensionYears * 12;
  const annuityChart      = useMemo(
    () => genAnnuityChart(pensionPV, pensionRate, pensionYears),
    [pensionPV, pensionRate, pensionYears]
  );
  // 일시금(중도해지) vs 연금 비교 — IRP 세액공제·운용수익 재원 기준
  // 일시금/중도해지: 기타소득세 16.5% / 연금: 위 연금소득세 누계
  const LUMP_TAX_RATE   = 0.165;
  const lumpTax         = pensionPV * LUMP_TAX_RATE;
  const annuityTotalTax = annualTax * pensionYears;
  const taxSaving       = lumpTax - annuityTotalTax;

  // ── 연금 로드맵 계산 ──
  const road = useMemo(
    () => genRoadmap(roadCurrentAge, roadRetireAge, roadSeed * 10_000, roadMonthly * 10_000, roadAccRate, 0, 0, roadWithdrawYears, roadWithdrawRate),
    [roadCurrentAge, roadRetireAge, roadSeed, roadMonthly, roadAccRate, roadWithdrawYears, roadWithdrawRate]
  );
  const roadAccYears   = Math.max(0, roadRetireAge - roadCurrentAge);
  const { rate: roadTaxRate } = getPensionTaxRate(roadRetireAge);
  const roadAnnualGross = road.grossMonthly * 12;
  const roadAnnualTax  = Math.min(roadAnnualGross, 15_000_000) * roadTaxRate + Math.max(0, roadAnnualGross - 15_000_000) * 0.165;
  const roadMonthlyNet = road.grossMonthly - roadAnnualTax / 12;
  const roadPeakReal   = realValue(road.peak, roadAccYears);

  const xInterval = (y: number) => Math.max(0, Math.ceil(y / 8) - 1);

  const isAccum    = mode === "accumulate";
  const isTarget   = mode === "target";
  const isTax      = mode === "tax";
  const isPension  = mode === "pension";
  const isRoadmap  = mode === "roadmap";

  const validTarget = neededPMTMan > 0 && neededPMTMan < 10_000;

  const TABS: [Mode, string][] = [
    ["accumulate", "적립식 계산"],
    ["target",     "목표 역산"],
    ["tax",        "세액공제"],
    ["pension",    "연금 수령"],
    ["roadmap",    "연금 로드맵"],
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-2.5">

      {/* ── 헤더 ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">연금 계산기</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {isTax     ? "IRP·DC 납입액으로 연말정산 세액공제 혜택을 계산하세요."
          : isPension ? "적립금을 연금으로 수령할 때 월 수령액과 세금을 시뮬레이션하세요."
          : isRoadmap ? "적립부터 수령까지, 평생 연금 흐름을 하나의 타임라인으로 확인하세요."
          :             "월 투자금과 기간을 설정해 미래 자산을 시뮬레이션하세요."}
        </p>
      </div>

      {/* ── 모드 토글 (타이틀 아래 배치) ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5 overflow-x-auto w-full sm:w-fit">
        {TABS.map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 sm:flex-initial px-2 sm:px-5 py-1 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              mode === m ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 적립식 / 목표 역산 ── */}
      {(isAccum || isTarget) && (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[5fr_7fr]">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-2.5">
            <h2 className="font-semibold text-gray-900">
              {isAccum ? "투자 설정" : "목표 설정"}
            </h2>
            {isAccum ? (
              <>
                <SliderInput label="기존 적립금 (시드머니)" value={seed}    onChange={setSeed}    min={0}    max={50000}  step={500} unit="만원" tickLeft="0"         tickRight="5억원" />
                <SliderInput label="월 투자금"       value={monthly} onChange={setMonthly} min={10}   max={500}    step={10}  unit="만원" tickLeft="10만원"    tickRight="500만원" />
                <SliderInput label="투자 기간"        value={years}   onChange={setYears}   min={1}    max={40}     step={1}   unit="년"   tickLeft="1년"        tickRight="40년" />
                <SliderInput label="연 수익률 (CAGR)" value={rate}    onChange={setRate}    min={0.5}  max={25}     step={0.5} unit="%"    tickLeft="0.5%"       tickRight="25%" />
              </>
            ) : (
              <>
                <SliderInput label="기존 적립금 (시드머니)" value={targetSeed}  onChange={setTargetSeed}  min={0}    max={50000}  step={500}  unit="만원" tickLeft="0"         tickRight="5억원" />
                <SliderInput label="목표 금액"        value={targetMan}   onChange={setTargetMan}   min={1000} max={100000} step={1000} unit="만원" tickLeft="1,000만원" tickRight="10억원" />
                <SliderInput label="투자 기간"         value={targetYears} onChange={setTargetYears} min={1}    max={40}     step={1}    unit="년"   tickLeft="1년"       tickRight="40년" />
                <SliderInput label="연 수익률 (CAGR)"  value={targetRate}  onChange={setTargetRate}  min={0.5}  max={25}     step={0.5}  unit="%"    tickLeft="0.5%"      tickRight="25%" />
              </>
            )}
            <div className="pt-1 border-t border-gray-100 space-y-2.5">
              <SliderInput label="매년 납입 증액 (급여 상승 반영)" value={stepUp}    onChange={setStepUp}    min={0} max={15} step={1}   unit="%" tickLeft="0%" tickRight="15%" />
              <SliderInput label="운용보수 (연 TER)"            value={ter}       onChange={setTer}       min={0} max={2}  step={0.1} unit="%" tickLeft="0%" tickRight="2%" />
              <SliderInput label="물가상승률 (실질가치 환산)"    value={inflation} onChange={setInflation} min={0} max={6}  step={0.1} unit="%" tickLeft="0%" tickRight="6%" />
              {ter > 0 && (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  운용보수 차감 후 실질 수익률 <strong>연 {((isAccum ? rate : targetRate) - ter).toFixed(1)}%</strong> 기준으로 계산됩니다.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-3 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {isAccum
                  ? `${years}년 후 예상 자산 — 월 ${monthly.toLocaleString()}만원${stepUp > 0 ? ` (매년 +${stepUp}%)` : ""} · 연 ${rate}%`
                  : `필요 ${stepUp > 0 ? "첫해 " : ""}월 투자금 — 목표 ${fmt(targetMan * 10_000)} · ${targetYears}년 · 연 ${targetRate}%`}
              </p>
              {isAccum ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">최종 금액</p><p className="text-xl font-bold text-emerald-400">{fmt(fv)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">총 투자금</p><p className="text-xl font-bold text-white">{fmt(principal)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">수익금</p><p className="text-xl font-bold text-emerald-400">+{fmt(profit)}</p></div>
                </div>
              ) : seedSuffices ? (
                <p className="text-sm text-emerald-300 font-medium">✓ 기존 적립금 {fmt(targetSeedWon)}의 복리 성장만으로 목표를 달성합니다. 추가 납입이 필요 없습니다.</p>
              ) : validTarget ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><p className="text-[11px] text-slate-400 mb-0.5">월 투자금</p><p className="text-xl font-bold text-emerald-400">{fmt(neededPMTMan * 10_000)}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">총 납입금</p><p className="text-xl font-bold text-white">{fmt(totalPaid)}{targetSeedWon > 0 && <span className="text-[11px] text-slate-400 font-normal"> +시드 {fmt(targetSeedWon)}</span>}</p></div>
                  <div><p className="text-[11px] text-slate-400 mb-0.5">예상 수익금</p><p className="text-xl font-bold text-emerald-400">+{fmt(Math.max(0, targetProfit))}</p></div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">수익률 또는 기간을 조정해주세요.</p>
              )}
              {inflation > 0 && (isAccum ? fv > 0 : validTarget) && (
                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                  {isAccum
                    ? <>오늘 가치로 약 <span className="font-semibold text-amber-300">{fmt(realValue(fv, years))}</span> · 연 {inflation}% 물가 반영 시 실질 구매력</>
                    : <>목표 {fmt(targetMan * 10_000)}의 오늘 가치는 약 <span className="font-semibold text-amber-300">{fmt(realValue(targetMan * 10_000, targetYears))}</span> (연 {inflation}% 물가)</>}
                </p>
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

            {(isAccum ? fv > 0 : (validTarget || seedSuffices)) && (
              <button
                onClick={() => linkToPension(isAccum ? fv : targetWon, isAccum ? "accumulate" : "target")}
                className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-blue-50 border border-blue-100 rounded-2xl hover:bg-blue-100 active:bg-blue-200 transition-colors text-left"
              >
                <span className="text-sm text-blue-900">
                  이렇게 모은 <strong>{fmt(isAccum ? fv : targetWon)}</strong>, 연금으로 받으면 매달 얼마?
                </span>
                <span className="text-blue-600 text-sm font-semibold whitespace-nowrap">연금 수령 →</span>
              </button>
            )}

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
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-2.5">
            <h2 className="font-semibold text-gray-900">납입 정보</h2>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">총급여</label>
                <div className="flex items-center gap-1.5">
                  <NumberField
                    value={grossIncome} onChange={setGrossIncome} min={1000} max={100000} step={100}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
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

          <div className="space-y-2.5">
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-3 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{new Date().getFullYear()}년 귀속 연말정산 세액공제 예상액</p>
              <div className="grid grid-cols-2 gap-4 mb-3">
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

            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">소득 구간별 공제율</h3>
              <div className="space-y-2.5">
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
              <div className="mt-3">
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

            {/* 환급금 재투자 복리 효과 */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">환급금 재투자 복리 효과</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">매년 받는 환급금({fmt(tax.deductionWon)})을 재투자하면 세액공제가 복리로 불어납니다.</p>
              </div>
              <SliderInput label="재투자 기간"   value={reinvestYears} onChange={setReinvestYears} min={1} max={40} step={1}   unit="년" tickLeft="1년" tickRight="40년" />
              <SliderInput label="재투자 수익률" value={reinvestRate}  onChange={setReinvestRate}  min={0} max={15} step={0.5} unit="%"  tickLeft="0%"  tickRight="15%" />
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                <div><p className="text-[11px] text-gray-400 mb-0.5">누적 환급금</p><p className="text-sm font-bold text-gray-700">{fmt(reinvestSum)}</p></div>
                <div><p className="text-[11px] text-gray-400 mb-0.5">재투자 후 자산</p><p className="text-sm font-bold text-blue-600">{fmt(reinvestFV)}</p></div>
                <div><p className="text-[11px] text-gray-400 mb-0.5">추가 복리수익</p><p className="text-sm font-bold text-emerald-600">+{fmt(reinvestProfit)}</p></div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                연 {fmt(tax.deductionWon)} 환급금을 {reinvestYears}년간 연 {reinvestRate}%로 재투자한 결과입니다. 환급금을 다시 IRP에 납입하면 추가 세액공제까지 받을 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 연금 수령 시뮬레이션 ── */}
      {isPension && (
        <>
        {linkedFrom && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900">
            <span className="text-blue-500">↪</span>
            <span><strong>{linkedFrom === "accumulate" ? "적립식 계산" : "목표 역산"}</strong>에서 가져온 적립금 {fmt(pensionFund * 10_000)} 기준으로 시뮬레이션합니다.</span>
            <button onClick={() => setMode(linkedFrom)} className="ml-auto text-blue-600 font-semibold whitespace-nowrap hover:underline">적립 단계로 ↩</button>
          </div>
        )}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[5fr_7fr]">
          {/* 왼쪽: 입력 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-2.5">
            <h2 className="font-semibold text-gray-900">수령 조건 설정</h2>
            <SliderInput label="예상 적립금"        value={pensionFund}  onChange={(v) => { setPensionFund(v); setLinkedFrom(null); }}  min={1000}  max={200000} step={1000} unit="만원" tickLeft="1,000만원" tickRight="20억원" />
            <SliderInput label="수령 시작 나이"      value={pensionAge}   onChange={setPensionAge}   min={55}    max={80}     step={1}    unit="세"   tickLeft="55세"      tickRight="80세" />
            <SliderInput label="수령 기간"           value={pensionYears} onChange={setPensionYears} min={5}     max={30}     step={1}    unit="년"   tickLeft="5년"       tickRight="30년" />
            <SliderInput label="연금 운용 수익률"    value={pensionRate}  onChange={setPensionRate}  min={0}     max={7}      step={0.5}  unit="%"    tickLeft="0%"        tickRight="7%" />
            <SliderInput label="물가상승률 (실질가치 환산)" value={inflation} onChange={setInflation} min={0} max={6} step={0.1} unit="%" tickLeft="0%" tickRight="6%" />

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
          <div className="space-y-2.5">
            {/* 메인 결과 카드 */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-3 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                {pensionAge}세부터 {pensionYears}년 수령 — {fmt(pensionFund * 10_000)} 적립금 · 연 {pensionRate}% 운용
              </p>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">월 수령액 (세후)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{fmt(monthlyNet)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">세전 {fmt(monthlyGross)}<br />세금 {fmt(monthlyTax)}</p>
                  {inflation > 0 && (
                    <p className="text-[10px] text-amber-300/90 mt-1 leading-tight">수령 {pensionYears}년 차 실질가치 {fmt(realValue(monthlyNet, pensionYears))}</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">연간 수령액 (세후)</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{fmt(annualNet)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">총 {fmt(totalReceived)} 수령</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-700 pt-3">
                <div><p className="text-[11px] text-slate-500 mb-0.5">적용 세율</p><p className="text-sm font-semibold text-slate-300">{effTaxLabel}</p></div>
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
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">일시금 vs 연금 수령 비교</h3>
              <p className="text-[11px] text-gray-400 mb-3">세액공제·운용수익 재원 기준 — 일시금/중도해지 기타소득세 16.5% vs 연금소득세 누계</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: "일시금/중도해지", 세금: Math.round(lumpTax / 10_000), color: "#ef4444" },
                      { name: "연금 수령", 세금: Math.round(annuityTotalTax / 10_000), color: "#3b82f6" },
                    ]}
                    layout="vertical"
                    margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}만`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={92} />
                    <Tooltip formatter={((v: number | undefined) => [`${(v ?? 0).toLocaleString()}만원`, "납부 세금"]) as any} />
                    <Bar dataKey="세금" radius={[0, 4, 4, 0]}>
                      {[{ color: "#ef4444" }, { color: "#3b82f6" }].map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {taxSaving > 0 ? (
                <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-emerald-600 text-lg">✓</span>
                  <p className="text-xs text-emerald-800">
                    연금 수령 시 일시금 대비 <strong>{fmt(taxSaving)}</strong> 세금 절감 추정
                  </p>
                </div>
              ) : isOverAnnualLimit ? (
                <div className="mt-3 flex items-start gap-2 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-amber-600 text-base leading-none mt-0.5">!</span>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    연 수령액이 <strong>1,500만원을 초과</strong>해 연금소득세도 전액 16.5%가 적용 → 일시금 대비 절세 효과가 사라집니다.
                    <strong> 수령 기간을 늘려 연 1,500만원 이하</strong>로 낮추면 3.3~5.5% 저율과세를 받습니다.
                  </p>
                </div>
              ) : null}
              <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">
                ※ 퇴직금 재원은 <strong>퇴직소득세</strong>가 적용되며, 연금으로 수령하면 퇴직소득세를 30%(10년 이내)~40%(11년 이상) 감면받습니다. 위 비교는 세액공제·운용수익 재원 기준입니다.
              </p>
            </div>

            {/* 잔액 추이 차트 */}
            <div className="bg-white border border-gray-200 rounded-2xl px-5 pt-3 pb-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-2">연도별 잔액 추이</p>
              <div className="h-32">
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
        </>
      )}

      {/* ── 연금 로드맵 (적립기 → 수령기 통합 타임라인) ── */}
      {isRoadmap && (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[5fr_7fr]">
          {/* 왼쪽: 입력 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-emerald-600">① 적립 단계</p>
            <SliderInput label="현재 나이"      value={roadCurrentAge} onChange={(v) => setRoadCurrentAge(Math.min(v, roadRetireAge - 1))} min={20} max={64} step={1} unit="세" tickLeft="20세" tickRight="64세" />
            <SliderInput label="수령 시작 나이"  value={roadRetireAge}  onChange={(v) => setRoadRetireAge(Math.max(v, roadCurrentAge + 1))}  min={55} max={75} step={1} unit="세" tickLeft="55세" tickRight="75세" />
            <SliderInput label="기존 적립금"     value={roadSeed}       onChange={setRoadSeed}       min={0}  max={50000} step={500} unit="만원" tickLeft="0" tickRight="5억원" />
            <SliderInput label="월 납입금"       value={roadMonthly}    onChange={setRoadMonthly}    min={0}  max={500}   step={10}  unit="만원" tickLeft="0" tickRight="500만원" />
            <SliderInput label="적립 수익률"     value={roadAccRate}    onChange={setRoadAccRate}    min={0.5} max={15}  step={0.5} unit="%" tickLeft="0.5%" tickRight="15%" />

            <p className="text-xs font-semibold text-blue-600 pt-2 border-t border-gray-100">② 수령 단계</p>
            <SliderInput label="수령 기간"       value={roadWithdrawYears} onChange={setRoadWithdrawYears} min={5} max={35} step={1}   unit="년" tickLeft="5년" tickRight="35년" />
            <SliderInput label="수령 운용 수익률" value={roadWithdrawRate}  onChange={setRoadWithdrawRate}  min={0} max={7}  step={0.5} unit="%" tickLeft="0%" tickRight="7%" />

            <SliderInput label="물가상승률 (실질가치 환산)" value={inflation} onChange={setInflation} min={0} max={6} step={0.1} unit="%" tickLeft="0%" tickRight="6%" />
          </div>

          {/* 오른쪽: 결과 + 타임라인 */}
          <div className="space-y-2.5">
            <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-3 text-white">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {roadCurrentAge}세부터 {roadAccYears}년 적립 → {roadRetireAge}세부터 {roadWithdrawYears}년 수령
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">{roadRetireAge}세 예상 자산</p>
                  <p className="text-xl font-bold text-emerald-400">{fmt(road.peak)}</p>
                  {inflation > 0 && <p className="text-[10px] text-amber-300/90 mt-0.5">오늘 가치 {fmt(roadPeakReal)}</p>}
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">월 수령액 (세후)</p>
                  <p className="text-xl font-bold text-white">{fmt(roadMonthlyNet)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">세전 {fmt(road.grossMonthly)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">자산 소진 나이</p>
                  <p className="text-xl font-bold text-white">{road.depletionAge}세</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl px-5 pt-4 pb-3 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">평생 자산 흐름</p>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />적립기</div>
                  <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300" />수령기</div>
                </div>
              </div>
              <div className="h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={road.data} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}세`} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 10_000 ? `${(v / 10_000).toFixed(0)}억` : `${v}만`} width={46} />
                    <Tooltip
                      formatter={((v: number | undefined, name: string) => [`${(v ?? 0).toLocaleString()}만원`, name]) as any}
                      labelFormatter={(l) => `${l}세`}
                      labelStyle={{ fontWeight: 600, fontSize: 12 }} contentStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine x={roadRetireAge} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "은퇴", fontSize: 11, fill: "#64748b", position: "top" }} />
                    <Area type="monotone" dataKey="적립자산" stroke="#10b981" fill="#d1fae5" strokeWidth={2} connectNulls={false} />
                    <Area type="monotone" dataKey="수령잔액" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                {roadCurrentAge}세에 {fmt(roadSeed * 10_000)}로 시작해 매달 {roadMonthly}만원씩 {roadAccYears}년 적립하면 {roadRetireAge}세에 <strong className="text-gray-600">{fmt(road.peak)}</strong>, 이후 매달 {fmt(roadMonthlyNet)}씩 받아 {road.depletionAge}세에 소진됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-1">
        {isTax
          ? "세액공제액은 소득세 기준 추정치입니다. 지방소득세 포함 여부, 과세표준에 따라 실제 환급액이 다를 수 있습니다."
          : isPension
          ? "연금소득세는 분리과세 기준 추정치입니다. 연 1,500만원 초과 시 종합과세 대상이 될 수 있으며, 실제 세금은 다를 수 있습니다."
          : isRoadmap
          ? "적립·수령 수익률을 일정하게 가정한 단순 추정입니다. 실제 수익률 변동·물가·세금에 따라 결과가 달라질 수 있습니다."
          : "복리 원리 기반 시뮬레이션 · 실제 투자 결과와 다를 수 있습니다."}
      </p>
    </div>
  );
}
