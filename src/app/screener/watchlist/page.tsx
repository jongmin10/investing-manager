"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getWatchlist, toggleWatchlistItem } from "@/lib/watchlist";

interface StockItem {
  id: string; name: string; market: string; sector: string | null;
  price: number; changeRate: number | null;
  high52w: number; low52w: number; high52wRatio: number;
  volume: number | null;
  per: number | null; cnsPer: number | null; cnsEps: number | null;
  pbr: number | null; dividendYield: number | null;
  revenue: number | null; operatingProfit: number | null;
  revenueGrowth: number | null; opGrowth: number | null;
  netGrowth: number | null; opMargin: number | null;
  period: string | null;
}

function fmtPrice(v: number) { return v.toLocaleString("ko-KR") + "원"; }
function fmtPct(v: number | null) {
  if (v == null) return null;
  return v.toFixed(2);
}

function FinBadge({ label, value, isGrowth, nullReason }: {
  label: string; value: number | null; isGrowth: boolean; nullReason?: string;
}) {
  if (value == null) return (
    <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-50/60">
      <span className="text-gray-300">{label}</span>
      <span className="text-gray-300 text-[9px] italic">{nullReason ?? "-"}</span>
    </div>
  );
  const color = isGrowth
    ? (value >= 20 ? "text-emerald-600" : value >= 0 ? "text-blue-500" : "text-red-400")
    : (value >= 15 ? "text-emerald-600" : value >= 5 ? "text-blue-500" : "text-gray-400");
  return (
    <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-50">
      <span className="text-gray-400">{label}</span>
      <span className={`font-bold ${color}`}>{value >= 0 && isGrowth ? "+" : ""}{value.toFixed(1)}%</span>
    </div>
  );
}

function Badge({ label, value, unit, estimate = false }: {
  label: string; value: number | null; unit: string; estimate?: boolean;
}) {
  const bg = estimate ? "bg-amber-50 border border-amber-100" : "bg-gray-50";
  const labelColor = estimate ? "text-amber-500" : "text-gray-400";

  if (value == null) return (
    <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] ${bg}/60`}>
      <span className="text-gray-300">{label}</span>
      <span className="text-gray-300 text-[9px] italic">-</span>
    </div>
  );

  const numStr = unit === "원"
    ? value.toLocaleString("ko-KR")
    : value.toFixed(2);

  const color = unit === "x"
    ? (value < 10 ? "text-emerald-600" : value < 20 ? "text-blue-500" : "text-gray-500")
    : unit === "%"
    ? (value >= 3 ? "text-emerald-600" : value >= 1 ? "text-blue-500" : "text-gray-400")
    : "text-gray-600";

  return (
    <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] ${bg}`}>
      <span className={labelColor}>{label}</span>
      <span className={`font-bold ${color}`}>{numStr}{unit}</span>
    </div>
  );
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [items, setItems]         = useState<StockItem[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const ids = getWatchlist();
    setWatchlist(ids);
    if (ids.size === 0) { setLoading(false); return; }

    fetch("/api/screener?limit=200")
      .then((r) => r.json())
      .then((data) => {
        const filtered = (data.items ?? []).filter((i: StockItem) => ids.has(i.id));
        setItems(filtered);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleRemove(id: string) {
    const next = toggleWatchlistItem(id);
    setWatchlist(new Set(next));
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/screener" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              종목 스크리너
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-700">관심종목</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            ★ 관심종목
            {!loading && <span className="ml-2 text-sm font-normal text-gray-400">{items.length}개</span>}
          </h1>
        </div>
        <Link href="/screener"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
          ← 스크리너로 돌아가기
        </Link>
      </div>

      {/* 본문 */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* 가로 스크롤 래퍼 */}
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">

        {/* 컬럼 헤더 */}
        <div className="grid grid-cols-[2fr_1.2fr_1fr_1.3fr_1.5fr_1.5fr_auto] gap-x-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span className="text-right">52주 고가 근접</span>
          <span className="text-center">재무 (YoY)</span>
          <span className="text-center">가치지표</span>
          <span className="w-8" />
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1.2fr_1fr_1.3fr_1.5fr_1.5fr_auto] gap-x-3 px-5 py-3.5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="h-4 bg-gray-100 rounded w-3/4 ml-auto" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="w-8" />
              </div>
            ))}
          </div>
        )}

        {/* 빈 상태 */}
        {!loading && items.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-4xl mb-3">☆</p>
            <p className="text-gray-500 font-medium">관심종목이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              <Link href="/screener" className="underline hover:text-gray-600">종목 스크리너</Link>에서 ☆를 클릭해 추가하세요
            </p>
          </div>
        )}

        {/* 목록 */}
        {!loading && items.length > 0 && (
          <div className="divide-y divide-gray-50">
            {items.map((item) => {
              const isPos = (item.changeRate ?? 0) >= 0;
              const ratio = item.high52wRatio;
              const ratioColor = ratio >= 95 ? "#059669" : ratio >= 85 ? "#16a34a" : ratio >= 70 ? "#2563eb" : "#6b7280";
              const ratioBg   = ratio >= 95 ? "#d1fae5" : ratio >= 85 ? "#dcfce7" : ratio >= 70 ? "#dbeafe" : "#f3f4f6";

              return (
                <div key={item.id}
                  className="grid grid-cols-[2fr_1.2fr_1fr_1.3fr_1.5fr_1.5fr_auto] gap-x-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors items-center">

                  {/* 종목명 */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.market === "KOSPI" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                      }`}>{item.market}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {item.sector} · {item.id}
                    </p>
                  </div>

                  {/* 현재가 */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{fmtPrice(item.price)}</p>
                  </div>

                  {/* 등락률 */}
                  <div className="text-right">
                    <span className={`text-sm font-bold ${isPos ? "text-emerald-600" : "text-red-500"}`}>
                      {isPos ? "+" : ""}{fmtPct(item.changeRate)}%
                    </span>
                  </div>

                  {/* 52주 고가 근접 */}
                  <div className="flex flex-col gap-1 items-end">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ color: ratioColor, background: ratioBg }}>{ratio}%</span>
                    <span className="text-[11px] text-gray-400">고 {fmtPrice(item.high52w)}</span>
                  </div>

                  {/* 재무 지표 */}
                  {(() => {
                    const FIN_SECTORS = ["금융", "보험", "은행", "증권"];
                    const isFinancial = FIN_SECTORS.some(s => item.sector?.includes(s));
                    return (
                      <div className="flex flex-col gap-0.5">
                        <FinBadge label="매출"   value={item.revenueGrowth} isGrowth
                          nullReason={item.revenue == null ? (isFinancial ? "금융업 특성" : "데이터없음") : "미산출"} />
                        <FinBadge label="영업↑"  value={item.opGrowth}  isGrowth nullReason="미산출" />
                        <FinBadge label="순이익" value={item.netGrowth} isGrowth nullReason="미산출" />
                        <FinBadge label="마진"   value={item.opMargin}  isGrowth={false} nullReason="미산출" />
                      </div>
                    );
                  })()}

                  {/* 가치지표 */}
                  <div className="flex flex-col gap-0.5">
                    <Badge label="PER"     value={item.per}          unit="x" />
                    <Badge label="추정PER" value={item.cnsPer}       unit="x" estimate />
                    <Badge label="추정EPS" value={item.cnsEps}       unit="원" estimate />
                    <Badge label="PBR"     value={item.pbr}          unit="x" />
                    <Badge label="배당"    value={item.dividendYield} unit="%" />
                  </div>

                  {/* 해제 + 네이버 링크 */}
                  <div className="flex items-center gap-1.5 justify-center">
                    <button onClick={() => handleRemove(item.id)}
                      title="관심종목 해제" className="text-amber-400 hover:text-gray-300 transition-colors text-base leading-none">
                      ★
                    </button>
                    <a href={`https://finance.naver.com/item/main.naver?code=${item.id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-gray-300 hover:text-blue-400 transition-colors" title="네이버 금융">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

          </div>{/* min-w-[680px] */}
        </div>{/* overflow-x-auto */}
      </div>
    </div>
  );
}
