"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { AssetClass, ASSET_CLASS_COLOR, ASSET_CLASS_LABEL } from "@/lib/tracker";

interface Holding {
  id: string;
  fundName: string;
  assetClass: AssetClass;
  weight: number;
  purchaseDate: string;
  estimatedReturn: number;
}

interface TrackerData {
  holdings: Holding[];
  portfolio: { totalReturn: number; totalWeight: number } | null;
  benchmarks: { kospi: number; cpi: number } | null;
}

const ASSET_CLASSES: AssetClass[] = ["GUARANTEED", "BOND", "MIXED", "EQUITY"];

function ReturnBadge({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={`text-sm font-bold ${isPos ? "text-emerald-600" : "text-red-500"}`}>
      {isPos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function formatKRW(amount: number): string {
  if (Math.abs(amount) >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${eok >= 0 ? "+" : ""}${eok.toFixed(1)}억원`;
  }
  const man = amount / 10_000;
  return `${man >= 0 ? "+" : ""}${man.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원`;
}

export default function TrackerPage() {
  const [data, setData] = useState<TrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [totalInvestmentInput, setTotalInvestmentInput] = useState("");

  const totalInvestment = totalInvestmentInput ? parseFloat(totalInvestmentInput) * 10_000 : null;

  const [form, setForm] = useState({
    fundName: "",
    assetClass: "EQUITY" as AssetClass,
    weight: "",
    purchaseDate: "",
  });

  async function fetchData() {
    const res = await fetch("/api/tracker");
    if (res.status === 401) { setUnauthorized(true); setLoading(false); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fundName || !form.weight || !form.purchaseDate) return;
    setSubmitting(true);
    const res = await fetch("/api/tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, weight: parseFloat(form.weight) }),
    });
    if (res.ok) {
      setForm({ fundName: "", assetClass: "EQUITY", weight: "", purchaseDate: "" });
      fetchData();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/tracker/${id}`, { method: "DELETE" });
    setDeletingId(null);
    fetchData();
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-gray-400">불러오는 중...</p></div>;
  }

  if (unauthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <p className="text-gray-600 font-medium text-lg">로그인이 필요한 기능입니다.</p>
        <a href="/login" className="bg-blue-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-blue-600 transition-colors">
          로그인 →
        </a>
      </div>
    );
  }

  const holdings = data?.holdings ?? [];
  const portfolio = data?.portfolio;
  const benchmarks = data?.benchmarks;
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const weightWarning = totalWeight > 100 ? "⚠ 비중 합계가 100%를 초과합니다." : totalWeight < 100 && holdings.length > 0 ? `비중 합계: ${totalWeight.toFixed(1)}% (미배분 ${(100 - totalWeight).toFixed(1)}%)` : "";

  const chartData = portfolio && benchmarks
    ? [
        { name: "내 포트폴리오", value: portfolio.totalReturn, color: "#3b82f6" },
        { name: "KOSPI", value: benchmarks.kospi, color: "#10b981" },
        { name: "물가상승률(CPI)", value: benchmarks.cpi, color: "#f59e0b" },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">나의 수익률 트래커</h1>
        <p className="text-sm text-gray-400 mt-0.5">퇴직연금 운용 현황을 입력하고 벤치마크와 비교해보세요.</p>
      </div>

      {/* 펀드 추가 폼 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-4">보유 펀드 추가</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">펀드명</label>
              <input
                type="text"
                placeholder="예: KODEX 200, 삼성 한국형 TDF 2045"
                value={form.fundName}
                onChange={(e) => setForm((f) => ({ ...f, fundName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">자산 유형</label>
              <select
                value={form.assetClass}
                onChange={(e) => setForm((f) => ({ ...f, assetClass: e.target.value as AssetClass }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {ASSET_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>{ASSET_CLASS_LABEL[cls]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">편입 비중 (%)</label>
              <input
                type="number"
                placeholder="40"
                min={1}
                max={100}
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">최초 매수일</label>
              <input
                type="date"
                value={form.purchaseDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>
          </div>
          {weightWarning && (
            <p className={`text-xs ${totalWeight > 100 ? "text-red-500" : "text-gray-400"}`}>{weightWarning}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "추가 중..." : "펀드 추가"}
          </button>
        </form>
      </div>

      {/* 보유 펀드 목록 */}
      {holdings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">보유 펀드 ({holdings.length})</h2>
          <div className="space-y-3">
            {holdings.map((h) => {
              const color = ASSET_CLASS_COLOR[h.assetClass];
              return (
                <div key={h.id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{h.fundName}</span>
                      <ReturnBadge value={h.estimatedReturn} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ASSET_CLASS_LABEL[h.assetClass]} · {h.weight}% · 매수일 {new Date(h.purchaseDate).toLocaleDateString("ko-KR")}
                    </p>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(h.weight, 100)}%`, background: color }} />
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(h.id)}
                    disabled={deletingId === h.id}
                    className="ml-2 text-gray-200 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0"
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 수익률 비교 차트 */}
      {chartData.length > 0 && portfolio && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">수익률 비교</h2>
            <span className="text-xs text-gray-400">최초 매수일 기준</span>
          </div>
          <p className="text-xs text-gray-400 mb-5">추정 수익률이며 실제 결과와 다를 수 있습니다.</p>

          {/* 총투자금 입력 */}
          <div className="mb-5 flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 whitespace-nowrap">총 투자금 (선택)</label>
            <div className="relative flex-1 max-w-xs">
              <input
                type="number"
                min={1}
                placeholder="예: 3000"
                value={totalInvestmentInput}
                onChange={(e) => setTotalInvestmentInput(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">만원</span>
            </div>
            {totalInvestmentInput && (
              <button
                onClick={() => setTotalInvestmentInput("")}
                className="text-gray-300 hover:text-gray-500 text-lg leading-none"
                title="초기화"
              >
                ×
              </button>
            )}
          </div>

          {/* 총 수익률 + 수익금 */}
          {totalInvestment ? (() => {
            const profit = totalInvestment * (portfolio.totalReturn / 100);
            const evaluation = totalInvestment + profit;
            const isPos = portfolio.totalReturn >= 0;
            return (
              <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">포트폴리오 추정 수익</p>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-[11px] text-slate-400 mb-0.5">수익률</p>
                    <p className={`text-2xl font-bold ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                      {isPos ? "+" : ""}{portfolio.totalReturn.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 mb-0.5">수익금</p>
                    <p className={`text-2xl font-bold ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                      {formatKRW(profit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 mb-0.5">평가금액</p>
                    <p className="text-2xl font-bold text-white">
                      {(evaluation / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원
                    </p>
                  </div>
                </div>
                <div className="border-t border-slate-700 pt-3 mt-1 flex justify-between items-center">
                  <p className="text-[11px] text-slate-500">
                    투자원금 {(totalInvestment / 10_000).toLocaleString("ko-KR")}만원 기준
                  </p>
                  <span className="text-[10px] text-slate-600 bg-slate-700/60 px-2 py-0.5 rounded-full">추정치</span>
                </div>
              </div>
            );
          })() : (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-center">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">포트폴리오 추정 수익률</p>
              <p className={`text-3xl font-bold ${portfolio.totalReturn >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {portfolio.totalReturn >= 0 ? "+" : ""}{portfolio.totalReturn.toFixed(2)}%
              </p>
            </div>
          )}

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, "수익률"]} />
                <ReferenceLine x={0} stroke="#9ca3af" />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 범례 */}
          <div className="mt-4 flex flex-wrap gap-4 justify-center">
            {chartData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span>{d.name}</span>
                <span className={`font-bold ${d.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {d.value >= 0 ? "+" : ""}{d.value.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {holdings.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <p className="text-gray-500 font-medium mb-1">보유 펀드를 추가해보세요</p>
          <p className="text-sm text-gray-400">펀드를 입력하면 시장 지표 기반으로 추정 수익률을 계산합니다.</p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        수익률은 KOSPI·국고채·기준금리 등 시장 지표 기반 추정치입니다. 실제 펀드 수익률과 차이가 있을 수 있으며,
        투자 결정의 근거로 사용하지 마세요.
      </p>
    </div>
  );
}
