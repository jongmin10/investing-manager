"use client";

import { useRouter, usePathname } from "next/navigation";
import YearMonthSelect from "@/components/YearMonthSelect";

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

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
