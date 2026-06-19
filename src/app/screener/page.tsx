"use client";

import { useEffect, useState, useCallback } from "react";

interface StockItem {
  id: string;
  name: string;
  market: string;
  sector: string | null;
  price: number;
  changeRate: number | null;
  high52w: number;
  low52w: number;
  high52wRatio: number;
  volume: number | null;
  collectedAt: string;
}

interface ScreenerResult {
  items: StockItem[];
  total: number;
  sectors: string[];
  collectedAt: string | null;
  isUpToDate: boolean;
}

type SortKey = "high52wRatio" | "changeRate" | "price";
type Market  = "ALL" | "KOSPI" | "KOSDAQ";

const MARKET_OPTIONS: { key: Market; label: string }[] = [
  { key: "ALL",    label: "전체"   },
  { key: "KOSPI",  label: "코스피" },
  { key: "KOSDAQ", label: "코스닥" },
];

function fmtPrice(v: number) {
  return v.toLocaleString("ko-KR") + "원";
}
function fmtVolume(v: number | null) {
  if (v == null) return "-";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + "K";
  return v.toString();
}
function fmtTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ScreenerPage() {
  const [result,    setResult]    = useState<ScreenerResult | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [collecting, setCollecting] = useState(false);

  // 필터 상태
  const [market,        setMarket]        = useState<Market>("ALL");
  const [sector,        setSector]        = useState("");
  const [high52wMin,    setHigh52wMin]    = useState(0);
  const [use52w,        setUse52w]        = useState(false);
  const [changeRateMin, setChangeRateMin] = useState("");
  const [changeRateMax, setChangeRateMax] = useState("");
  const [sortBy,        setSortBy]        = useState<SortKey>("high52wRatio");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("market", market);
    if (sector)             params.set("sector", sector);
    if (use52w && high52wMin > 0) params.set("high52wMin", String(high52wMin));
    if (changeRateMin)      params.set("changeRateMin", changeRateMin);
    if (changeRateMax)      params.set("changeRateMax", changeRateMax);
    params.set("sortBy", sortBy);

    const res  = await fetch(`/api/screener?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }, [market, sector, high52wMin, use52w, changeRateMin, changeRateMax, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCollect() {
    setCollecting(true);
    try {
      await fetch("/api/screener/collect", { method: "POST" });
      await fetchData();
    } finally {
      setCollecting(false);
    }
  }

  const sectors = result?.sectors ?? [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">종목 스크리너</h1>
          <p className="text-sm text-gray-400 mt-0.5">코스피·코스닥 종목 중 조건에 맞는 매수 후보를 검색합니다.</p>
        </div>

        {/* 수집 상태 + 버튼 */}
        <div className="flex items-center gap-3">
          {result && (
            <div className="text-right">
              <div className={`flex items-center gap-1.5 text-xs ${result.isUpToDate ? "text-emerald-600" : "text-amber-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${result.isUpToDate ? "bg-emerald-500" : "bg-amber-400"}`} />
                {result.isUpToDate ? "오늘 수집됨" : "수집 필요"}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {fmtTime(result.collectedAt)}
              </p>
            </div>
          )}
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {collecting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                수집 중...
              </>
            ) : (
              <>↻ 데이터 수집</>
            )}
          </button>
        </div>
      </div>

      {/* ── 필터 패널 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">

        {/* 행 1: 시장 + 업종 */}
        <div className="flex flex-wrap items-center gap-4">
          {/* 시장 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">시장</span>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {MARKET_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMarket(key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    market === key ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 업종 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">업종</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="">전체</option>
              {sectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* 정렬 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-gray-500">정렬</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="high52wRatio">52주 고가 근접도</option>
              <option value="changeRate">등락률 높은순</option>
              <option value="price">현재가 높은순</option>
            </select>
          </div>
        </div>

        {/* 행 2: 52주 신고가 + 등락률 */}
        <div className="flex flex-wrap items-center gap-6 pt-1 border-t border-gray-100">

          {/* 52주 신고가 근접 */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setUse52w((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${use52w ? "bg-blue-500" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${use52w ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-xs font-medium text-gray-700">52주 신고가</span>
            </label>
            {use52w && (
              <div className="flex items-center gap-2">
                <input
                  type="range" min={50} max={100} step={1}
                  value={high52wMin}
                  onChange={(e) => setHigh52wMin(Number(e.target.value))}
                  className="w-28 accent-blue-500"
                />
                <span className="text-sm font-bold text-blue-600 w-14">{high52wMin}% 이상</span>
              </div>
            )}
          </div>

          {/* 등락률 범위 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">등락률</span>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <input
                  type="number" step={0.1} placeholder="-10"
                  value={changeRateMin}
                  onChange={(e) => setChangeRateMin(e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs pr-5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
              </div>
              <span className="text-xs text-gray-400">~</span>
              <div className="relative">
                <input
                  type="number" step={0.1} placeholder="10"
                  value={changeRateMax}
                  onChange={(e) => setChangeRateMax(e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs pr-5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
              </div>
            </div>
          </div>

          {/* 초기화 */}
          {(sector || use52w || changeRateMin || changeRateMax || market !== "ALL") && (
            <button
              onClick={() => { setMarket("ALL"); setSector(""); setUse52w(false); setHigh52wMin(0); setChangeRateMin(""); setChangeRateMax(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* ── 결과 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* 결과 요약 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">
            {loading ? "검색 중..." : `${result?.total ?? 0}개 종목`}
            {result && !loading && (
              <span className="text-xs font-normal text-gray-400 ml-2">
                기준일 {fmtTime(result.collectedAt)}
              </span>
            )}
          </p>
          {!result?.isUpToDate && !loading && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
              ↑ 오늘 데이터 수집이 필요합니다
            </span>
          )}
        </div>

        {/* 테이블 헤더 */}
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr_auto] gap-x-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span>52주 고가 근접</span>
          <span className="text-right">거래량</span>
          <span className="w-8" />
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr_auto] gap-x-3 px-5 py-3.5 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 bg-gray-100 rounded w-4/5" />
                </div>
                <div className="h-3.5 bg-gray-100 rounded w-full" />
                <div className="h-3.5 bg-gray-100 rounded w-3/4 ml-auto" />
                <div className="h-3.5 bg-gray-100 rounded w-full" />
                <div className="h-3.5 bg-gray-100 rounded w-3/4 ml-auto" />
                <div className="w-8" />
              </div>
            ))}
          </div>
        )}

        {/* 데이터 없음 */}
        {!loading && result?.items.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-gray-500 font-medium">조건에 맞는 종목이 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">필터를 완화하거나 데이터를 수집해보세요.</p>
          </div>
        )}

        {/* 종목 목록 */}
        {!loading && result && result.items.length > 0 && (
          <div className="divide-y divide-gray-50">
            {result.items.map((item) => {
              const isPos = (item.changeRate ?? 0) >= 0;
              const ratio = item.high52wRatio;
              const ratioColor =
                ratio >= 95 ? "#059669" :
                ratio >= 85 ? "#16a34a" :
                ratio >= 70 ? "#2563eb" : "#6b7280";
              const ratioBg =
                ratio >= 95 ? "#d1fae5" :
                ratio >= 85 ? "#dcfce7" :
                ratio >= 70 ? "#dbeafe" : "#f3f4f6";

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr_auto] gap-x-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors items-center"
                >
                  {/* 종목명 */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.market === "KOSPI"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}>
                        {item.market}
                      </span>
                    </div>
                    {item.sector && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.sector} · {item.id}</p>
                    )}
                  </div>

                  {/* 현재가 */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{fmtPrice(item.price)}</p>
                  </div>

                  {/* 등락률 */}
                  <div className="text-right">
                    <span className={`text-sm font-bold ${isPos ? "text-emerald-600" : "text-red-500"}`}>
                      {isPos ? "+" : ""}{(item.changeRate ?? 0).toFixed(2)}%
                    </span>
                  </div>

                  {/* 52주 고가 근접 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: ratioColor, background: ratioBg }}
                      >
                        {ratio}%
                      </span>
                      <span className="text-[11px] text-gray-400">
                        고 {fmtPrice(item.high52w)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(ratio, 100)}%`, background: ratioColor }}
                      />
                    </div>
                  </div>

                  {/* 거래량 */}
                  <div className="text-right">
                    <span className="text-xs text-gray-500">{fmtVolume(item.volume)}</span>
                  </div>

                  {/* 외부 링크 */}
                  <div className="w-8 flex justify-center">
                    <a
                      href={`https://finance.naver.com/item/main.naver?code=${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-300 hover:text-blue-400 transition-colors"
                      title="네이버 금융에서 보기"
                    >
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
      </div>

      <p className="text-xs text-gray-400 text-center pb-1">
        주가는 Yahoo Finance 기준이며 지연될 수 있습니다. 투자 결정의 근거로 사용하지 마세요.
      </p>
    </div>
  );
}
