"use client";

import { useRouter, usePathname } from "next/navigation";

const SERIES_OPTIONS = [
  { value: "KOSPI",  label: "코스피 (KOSPI)"  },
  { value: "KOSDAQ", label: "코스닥 (KOSDAQ)" },
  { value: "DOW",    label: "다우존스 (DOW)"   },
  { value: "SP500",  label: "S&P 500"         },
  { value: "NASDAQ", label: "나스닥 (NASDAQ)"  },
] as const;

interface Preset {
  label: string;
  from: string;
  to: string;
}

const MIN_MONTH = "2000-01";
const MONTH_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
const SELECT_CLS =
  "rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function splitYm(ym: string): { y: number; m: number } {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}
function joinYm(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 년·월 별도 드롭다운. min/max("YYYY-MM") 범위 밖 월은 비활성화. */
function YearMonthSelect({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  label: string;
  onChange: (ym: string) => void;
}) {
  const { y, m } = splitYm(value);
  const { y: minY, m: minM } = splitYm(min);
  const { y: maxY, m: maxM } = splitYm(max);
  const years: number[] = [];
  for (let yr = minY; yr <= maxY; yr++) years.push(yr);

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={y}
        onChange={(e) => onChange(joinYm(Number(e.target.value), m))}
        className={SELECT_CLS}
        aria-label={`${label} 년`}
      >
        {years.map((yr) => (
          <option key={yr} value={yr}>
            {yr}년
          </option>
        ))}
      </select>
      <select
        value={m}
        onChange={(e) => onChange(joinYm(y, Number(e.target.value)))}
        className={SELECT_CLS}
        aria-label={`${label} 월`}
      >
        {MONTH_NUMS.map((mm) => (
          <option
            key={mm}
            value={mm}
            disabled={(y === maxY && mm > maxM) || (y === minY && mm < minM)}
          >
            {mm}월
          </option>
        ))}
      </select>
    </span>
  );
}

function buildPresets(): Preset[] {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const to = `${yyyy}-${mm}`;
  return [
    { label: "2000~",     from: "2000-01",           to },
    { label: "최근 10년", from: `${yyyy - 10}-${mm}`, to },
    { label: "최근 5년",  from: `${yyyy - 5}-${mm}`,  to },
  ];
}

export default function ReturnsControls({
  series,
  from,
  to,
}: {
  series: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const presets = buildPresets();
  const maxMonth = currentMonth();

  function navigate(newSeries: string, newFrom: string, newTo: string) {
    const params = new URLSearchParams({
      series: newSeries,
      from: newFrom,
      to: newTo,
    });
    router.replace(`${pathname}?${params.toString()}`);
  }

  // [MIN_MONTH, maxMonth] 범위로 클램프 (년/월 조합이 경계를 넘는 경우 방지)
  function clampBounds(ym: string): string {
    if (ym < MIN_MONTH) return MIN_MONTH;
    if (ym > maxMonth) return maxMonth;
    return ym;
  }
  // 시작월 변경: 종료월보다 뒤면 종료월도 함께 밀어 from ≤ to 유지
  function onFromChange(v: string) {
    if (!v) return;
    const nf = clampBounds(v);
    navigate(series, nf, nf > to ? nf : to);
  }
  // 종료월 변경: 시작월보다 앞이면 시작월도 함께 당겨 from ≤ to 유지
  function onToChange(v: string) {
    if (!v) return;
    const nt = clampBounds(v);
    navigate(series, nt < from ? nt : from, nt);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 시리즈 드롭다운 */}
      <select
        value={series}
        onChange={(e) => navigate(e.target.value, from, to)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        aria-label="시리즈 선택"
      >
        {SERIES_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* 기간 프리셋 */}
      <div className="flex gap-1" role="group" aria-label="기간 프리셋">
        {presets.map((p) => {
          const isActive = from === p.from && to === p.to;
          return (
            <button
              key={p.label}
              onClick={() => navigate(series, p.from, p.to)}
              aria-pressed={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-blue-500 text-white shadow-sm"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 기간 직접 설정 (시작 년/월 ~ 종료 년/월) */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="조회 기간 설정"
      >
        <YearMonthSelect
          value={from}
          min={MIN_MONTH}
          max={maxMonth}
          label="시작"
          onChange={onFromChange}
        />
        <span className="text-gray-400 text-xs">~</span>
        <YearMonthSelect
          value={to}
          min={MIN_MONTH}
          max={maxMonth}
          label="종료"
          onChange={onToChange}
        />
      </div>

      <span className="hidden sm:block text-xs text-gray-400">
        배당 미반영 ⓘ
      </span>
    </div>
  );
}
