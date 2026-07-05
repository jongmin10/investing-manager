"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from "recharts";
import type { CountryRecord } from "@/lib/datacenter";

interface Props {
  countries: CountryRecord[];
}

const REGION: Record<string, "아메리카" | "유럽" | "아시아·태평양"> = {
  US: "아메리카", CA: "아메리카",
  DE: "유럽", GB: "유럽", NL: "유럽", FR: "유럽",
  JP: "아시아·태평양", SG: "아시아·태평양", AU: "아시아·태평양",
  CN: "아시아·태평양", KR: "아시아·태평양", IN: "아시아·태평양",
};

const FLAG: Record<string, string> = {
  US: "🇺🇸", CA: "🇨🇦", DE: "🇩🇪", GB: "🇬🇧", NL: "🇳🇱",
  FR: "🇫🇷", JP: "🇯🇵", SG: "🇸🇬", AU: "🇦🇺",
  CN: "🇨🇳", KR: "🇰🇷", IN: "🇮🇳",
};

const COUNTRY_NAME: Record<string, string> = {
  US: "USA", CA: "Canada", DE: "Germany", GB: "UK", NL: "Netherlands",
  FR: "France", JP: "Japan", SG: "Singapore", AU: "Australia",
  CN: "China", KR: "Korea", IN: "India",
};

const REGION_COLORS: Record<string, string> = {
  "아메리카": "#3b82f6",
  "유럽": "#10b981",
  "아시아·태평양": "#f59e0b",
};

type RegionFilter = "전체" | "아메리카" | "유럽" | "아시아·태평양";

export default function DataCenterGlobal({ countries }: Props) {
  const [filter, setFilter] = useState<RegionFilter>("전체");

  const filtered =
    filter === "전체"
      ? countries
      : countries.filter((c) => REGION[c.country] === filter);

  const total = countries.reduce((s, c) => s + c.value, 0);

  // 대륙별 합산 (파이차트)
  const regionTotals = Object.entries(REGION_COLORS).map(([name]) => ({
    name,
    value: countries
      .filter((c) => REGION[c.country] === name)
      .reduce((s, c) => s + c.value, 0),
  }));

  // 요약 카드
  const apacTotal = countries
    .filter((c) => REGION[c.country] === "아시아·태평양")
    .reduce((s, c) => s + c.value, 0);
  const apacPct = total > 0 ? ((apacTotal / total) * 100).toFixed(1) : "—";

  const barColor = (code: string) => REGION_COLORS[REGION[code]] ?? "#94a3b8";

  if (countries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        데이터 수집 중 — 첫 cron 실행 후 표시됩니다
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">글로벌 DC 총수</p>
          <p className="text-xl font-bold text-gray-900">{total.toLocaleString()}개</p>
          <p className="text-xs text-gray-400 mt-1">12개국 합산</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">아시아·태평양 점유율</p>
          <p className="text-xl font-bold text-gray-900">{apacPct}%</p>
          <p className="text-xs text-gray-400 mt-1">
            JP·SG·AU·CN·KR·IN 합산
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm col-span-2 lg:col-span-1">
          <p className="text-xs text-gray-500 mb-1">미국 점유율</p>
          <p className="text-xl font-bold text-gray-900">
            {total > 0
              ? `${(((countries.find((c) => c.country === "US")?.value ?? 0) / total) * 100).toFixed(1)}%`
              : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1">YoY 증가율은 12개월 이력 후 산출</p>
        </div>
      </div>

      {/* 지역 필터 */}
      <div className="flex gap-2 flex-wrap">
        {(["전체", "아메리카", "유럽", "아시아·태평양"] as RegionFilter[]).map(
          (r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === r
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}
            </button>
          ),
        )}
      </div>

      {/* 국가별 바 차트 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          국가별 데이터센터 수
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(240, filtered.length * 36)}>
          <BarChart
            data={filtered.map((c) => ({
              name: `${FLAG[c.country] ?? ""} ${COUNTRY_NAME[c.country] ?? c.country}`,
              value: c.value,
              code: c.country,
            }))}
            layout="vertical"
            margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
          >
            <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} tickLine={false} />
            <Tooltip
              formatter={(v, _name, item) => [
                `${Number(v).toLocaleString()}개${(item?.payload as { code?: string })?.code === "CN" ? " ※과소추정" : ""}`,
                "DC 수",
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, formatter: (v: unknown) => Number(v).toLocaleString() }}>
              {filtered.map((c) => (
                <Cell key={c.country} fill={barColor(c.country)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {filtered.some((c) => c.country === "CN") && (
          <p className="text-[10px] text-gray-400 mt-2">
            ※ 중국(CN)은 baxtel.com 기준이며 실제보다 과소추정될 수 있습니다
          </p>
        )}
      </div>

      {/* 대륙별 파이 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">대륙별 분포</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={regionTotals}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(1)}%`
              }
              labelLine={false}
            >
              {regionTotals.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={REGION_COLORS[entry.name] ?? "#94a3b8"}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`${Number(v).toLocaleString()}개`]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 전체 상세 테이블 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left p-3 text-xs font-semibold text-gray-500">국가</th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">대륙</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500">DC 수</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 hidden md:table-cell">점유율</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500">WoW</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500">MoM</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.country} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="p-3 font-medium">
                  {FLAG[c.country] ?? ""} {COUNTRY_NAME[c.country] ?? c.country}
                  {c.country === "CN" && (
                    <span className="text-[10px] text-gray-400 ml-1">※</span>
                  )}
                </td>
                <td className="p-3 text-gray-500 text-xs hidden sm:table-cell">{REGION[c.country] ?? "—"}</td>
                <td className="p-3 text-right font-mono">
                  {c.value.toLocaleString()}
                </td>
                <td className="p-3 text-right text-gray-600 hidden md:table-cell">
                  {total > 0 ? `${((c.value / total) * 100).toFixed(1)}%` : "—"}
                </td>
                <td className={`p-3 text-right text-xs font-mono ${c.wowPct == null ? "text-gray-300" : c.wowPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {c.wowPct != null ? `${c.wowPct >= 0 ? "+" : ""}${c.wowPct.toFixed(2)}%` : "—"}
                </td>
                <td className={`p-3 text-right text-xs font-mono ${c.momPct == null ? "text-gray-300" : c.momPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {c.momPct != null ? `${c.momPct >= 0 ? "+" : ""}${c.momPct.toFixed(2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-400 p-3 border-t border-gray-100">
          WoW = 전주 대비 · MoM = 4주 전 대비 · 2주 이상 수집 후 산출
        </p>
      </div>
    </div>
  );
}
