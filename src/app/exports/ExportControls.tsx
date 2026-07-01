"use client";

import { useRouter, usePathname } from "next/navigation";
import YearMonthSelect from "@/components/YearMonthSelect";

const METRICS = [
  { value: "export", label: "수출" },
  { value: "import", label: "수입" },
  { value: "balance", label: "무역수지" },
] as const;

export default function ExportControls({
  items,
  item,
  from,
  to,
  metric,
  minMonth,
  maxMonth,
}: {
  items: { code: string; name: string }[];
  item: string;
  from: string;
  to: string;
  metric: string;
  minMonth: string;
  maxMonth: string; // 최신 확정 데이터월 (미래 빈 월 선택 방지 + 프리셋 정합)
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(next: { item?: string; from?: string; to?: string; metric?: string }) {
    const params = new URLSearchParams({
      item: next.item ?? item,
      from: next.from ?? from,
      to: next.to ?? to,
      metric: next.metric ?? metric,
    });
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clampBounds(ym: string): string {
    if (ym < minMonth) return minMonth;
    if (ym > maxMonth) return maxMonth;
    return ym;
  }
  function onFromChange(v: string) {
    if (!v) return;
    const nf = clampBounds(v);
    navigate({ from: nf, to: nf > to ? nf : to });
  }
  function onToChange(v: string) {
    if (!v) return;
    const nt = clampBounds(v);
    navigate({ from: nt < from ? nt : from, to: nt });
  }

  const presets = [
    { label: "전체", from: minMonth, to: maxMonth },
    { label: "최근 5년", from: shiftYears(maxMonth, -5, minMonth), to: maxMonth },
    { label: "최근 3년", from: shiftYears(maxMonth, -3, minMonth), to: maxMonth },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 품목 드롭다운 */}
      <select
        value={item}
        onChange={(e) => navigate({ item: e.target.value })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        aria-label="품목 선택"
      >
        {items.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>

      {/* 지표 세그먼트 토글 */}
      <div className="flex gap-1" role="group" aria-label="지표 선택">
        {METRICS.map((mt) => {
          const active = metric === mt.value;
          return (
            <button
              key={mt.value}
              onClick={() => navigate({ metric: mt.value })}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? "bg-blue-500 text-white shadow-sm"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {mt.label}
            </button>
          );
        })}
      </div>

      {/* 기간 프리셋 */}
      <div className="flex gap-1" role="group" aria-label="기간 프리셋">
        {presets.map((p) => {
          const active = from === p.from && to === p.to;
          return (
            <button
              key={p.label}
              onClick={() => navigate({ from: p.from, to: p.to })}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? "bg-blue-500 text-white shadow-sm"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 기간 직접 설정 */}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="조회 기간 설정">
        <YearMonthSelect value={from} min={minMonth} max={maxMonth} label="시작" onChange={onFromChange} />
        <span className="text-gray-400 text-xs">~</span>
        <YearMonthSelect value={to} min={minMonth} max={maxMonth} label="종료" onChange={onToChange} />
      </div>
    </div>
  );
}

// maxMonth 에서 n년 전 (minMonth 하한 클램프)
function shiftYears(ym: string, deltaYears: number, min: string): string {
  const [y, m] = ym.split("-").map(Number);
  const r = `${y + deltaYears}-${String(m).padStart(2, "0")}`;
  return r < min ? min : r;
}
