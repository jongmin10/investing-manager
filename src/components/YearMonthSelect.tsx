"use client";

// 년·월 별도 드롭다운. min/max("YYYY-MM") 범위 밖 월은 비활성화.
// returns(지수 수익률)·exports(품목별 수출) 등에서 공용 재사용.

const MONTH_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
const SELECT_CLS =
  "rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";

export function splitYm(ym: string): { y: number; m: number } {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}
export function joinYm(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function YearMonthSelect({
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
