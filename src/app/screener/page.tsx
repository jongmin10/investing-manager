"use client";

import { useEffect, useState, useCallback } from "react";

interface StockItem {
  id: string; name: string; market: string; sector: string | null;
  price: number; changeRate: number | null;
  high52w: number; low52w: number; high52wRatio: number;
  volume: number | null; collectedAt: string;
  revenue: number | null; operatingProfit: number | null;
  revenueGrowth: number | null; opGrowth: number | null;
  netGrowth: number | null; opMargin: number | null;
  period: string | null;
}

interface ScreenerResult {
  items: StockItem[];
  total: number;
  sectors: string[];
  financialStatus: { count: number; hasDartKey: boolean } | null;
  collectedAt: string | null;
  isUpToDate: boolean;
}

type SortKey = "high52wRatio" | "changeRate" | "price" | "revenueGrowth" | "opGrowth";
type Market  = "ALL" | "KOSPI" | "KOSDAQ";

const MARKET_OPTIONS: { key: Market; label: string }[] = [
  { key: "ALL",    label: "전체"   },
  { key: "KOSPI",  label: "코스피" },
  { key: "KOSDAQ", label: "코스닥" },
];

function fmtPrice(v: number) {
  return v >= 10_000
    ? (v / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "만"
    : v.toLocaleString("ko-KR") + "원";
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
function growthColor(v: number | null) {
  if (v == null) return "text-gray-300";
  return v >= 20 ? "text-emerald-600" : v >= 0 ? "text-blue-500" : "text-red-400";
}
function growthBg(v: number | null) {
  if (v == null) return "";
  return v >= 20 ? "bg-emerald-50" : v >= 0 ? "bg-blue-50" : "bg-red-50";
}

export default function ScreenerPage() {
  const [result,     setResult]     = useState<ScreenerResult | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [financialCollecting, setFinancialCollecting] = useState(false);

  // ── 필터 ─────────────────────────────────────────────
  const [market,           setMarket]           = useState<Market>("ALL");
  const [sector,           setSector]           = useState("");
  const [use52w,           setUse52w]           = useState(false);
  const [high52wMin,       setHigh52wMin]       = useState(80);
  const [changeRateMin,    setChangeRateMin]    = useState("");
  const [changeRateMax,    setChangeRateMax]    = useState("");
  const [revenueGrowthMin, setRevenueGrowthMin] = useState("");
  const [opGrowthMin,      setOpGrowthMin]      = useState("");
  const [opMarginMin,      setOpMarginMin]      = useState("");
  const [sortBy,           setSortBy]           = useState<SortKey>("high52wRatio");

  const hasFinancialFilter = revenueGrowthMin || opGrowthMin || opMarginMin;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("market", market);
    if (sector)                          params.set("sector", sector);
    if (use52w && high52wMin > 0)        params.set("high52wMin", String(high52wMin));
    if (changeRateMin)                   params.set("changeRateMin", changeRateMin);
    if (changeRateMax)                   params.set("changeRateMax", changeRateMax);
    if (revenueGrowthMin)                params.set("revenueGrowthMin", revenueGrowthMin);
    if (opGrowthMin)                     params.set("opGrowthMin", opGrowthMin);
    if (opMarginMin)                     params.set("opMarginMin", opMarginMin);
    params.set("sortBy", sortBy);

    const res  = await fetch(`/api/screener?${params}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }, [market, sector, use52w, high52wMin, changeRateMin, changeRateMax, revenueGrowthMin, opGrowthMin, opMarginMin, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCollect() {
    setCollecting(true);
    try { await fetch("/api/screener/collect", { method: "POST" }); await fetchData(); }
    finally { setCollecting(false); }
  }

  async function handleFinancialCollect() {
    setFinancialCollecting(true);
    try {
      const res  = await fetch("/api/screener/financial", { method: "POST" });
      const data = await res.json();
      if (data.error) alert(data.error + "\n\n" + (data.guide ?? []).join("\n"));
      else await fetchData();
    } finally { setFinancialCollecting(false); }
  }

  function resetFilters() {
    setMarket("ALL"); setSector(""); setUse52w(false); setHigh52wMin(80);
    setChangeRateMin(""); setChangeRateMax("");
    setRevenueGrowthMin(""); setOpGrowthMin(""); setOpMarginMin("");
  }

  const hasAnyFilter = sector || use52w || changeRateMin || changeRateMax ||
    revenueGrowthMin || opGrowthMin || opMarginMin || market !== "ALL";

  const fin = result?.financialStatus;
  const sectors = result?.sectors ?? [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">종목 스크리너</h1>
          <p className="text-sm text-gray-400 mt-0.5">코스피·코스닥 종목 중 조건에 맞는 매수 후보를 검색합니다.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 주가 수집 상태 + 버튼 */}
          <div className="flex items-center gap-2">
            {result && (
              <span className={`text-xs px-2.5 py-1 rounded-full border ${
                result.isUpToDate
                  ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                  : "bg-amber-50 border-amber-100 text-amber-600"
              }`}>
                {result.isUpToDate ? "✓ 오늘 수집" : `마지막 ${fmtTime(result.collectedAt)}`}
              </span>
            )}
            <button
              onClick={handleCollect} disabled={collecting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors"
            >
              {collecting
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />수집 중...</>
                : "↻ 주가 수집"}
            </button>
          </div>

          {/* 재무 수집 버튼 */}
          <button
            onClick={handleFinancialCollect} disabled={financialCollecting}
            title={fin?.hasDartKey ? "DART 재무 데이터 수집" : "DART_API_KEY 설정 필요"}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors disabled:opacity-50 ${
              fin?.hasDartKey
                ? "border-violet-200 text-violet-600 hover:bg-violet-50"
                : "border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {financialCollecting
              ? <><span className="w-3 h-3 border-2 border-violet-300/40 border-t-violet-500 rounded-full animate-spin" />수집 중...</>
              : <>📋 재무 수집 {fin ? `(${fin.count}개)` : ""}</>}
          </button>
        </div>
      </div>

      {/* DART 키 미설정 안내 */}
      {fin && !fin.hasDartKey && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-800">
          <p className="font-semibold mb-1">재무 데이터(매출·이익 성장률) 사용 방법</p>
          <ol className="list-decimal list-inside space-y-0.5 text-violet-700">
            <li>DART OpenAPI 키 발급: <span className="font-mono">opendart.fss.or.kr</span></li>
            <li><span className="font-mono">.env</span>에 <span className="font-mono">DART_API_KEY=발급받은키</span> 추가 후 서버 재시작</li>
            <li>터미널: <span className="font-mono">node scripts/fetch-dart-corp-codes.mjs</span> 실행</li>
            <li>위 "📋 재무 수집" 버튼 클릭</li>
          </ol>
        </div>
      )}

      {/* ── 필터 패널 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">

        {/* 행 1: 시장·업종·정렬 */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">시장</span>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {MARKET_OPTIONS.map(({ key, label }) => (
                <button key={key} onClick={() => setMarket(key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${market === key ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">업종</span>
            <select value={sector} onChange={(e) => setSector(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
              <option value="">전체</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-gray-500">정렬</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
              <option value="high52wRatio">52주 고가 근접도</option>
              <option value="changeRate">등락률 높은순</option>
              <option value="price">현재가 높은순</option>
              <option value="revenueGrowth">매출 성장률 높은순</option>
              <option value="opGrowth">영업이익 성장률 높은순</option>
            </select>
          </div>
        </div>

        {/* 행 2: 가격 조건 */}
        <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-gray-100">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-full -mb-2">가격 조건</span>

          <div className="flex items-center gap-3">
            <div onClick={() => setUse52w((v) => !v)}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${use52w ? "bg-blue-500" : "bg-gray-200"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${use52w ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <label className="text-xs font-medium text-gray-700 cursor-pointer" onClick={() => setUse52w((v) => !v)}>
              52주 신고가
            </label>
            {use52w && (
              <div className="flex items-center gap-2">
                <input type="range" min={50} max={100} step={1} value={high52wMin}
                  onChange={(e) => setHigh52wMin(Number(e.target.value))}
                  className="w-24 accent-blue-500" />
                <span className="text-sm font-bold text-blue-600 w-16">{high52wMin}% 이상</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">등락률</span>
            <NumInput value={changeRateMin} onChange={setChangeRateMin} placeholder="-10" />
            <span className="text-xs text-gray-400">~</span>
            <NumInput value={changeRateMax} onChange={setChangeRateMax} placeholder="+10" />
            <span className="text-xs text-gray-400">%</span>
          </div>
        </div>

        {/* 행 3: 재무 조건 */}
        <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-gray-100">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-full -mb-2">
            재무 조건
            {fin && fin.count === 0 && (
              <span className="ml-2 text-amber-400 font-normal normal-case">재무 데이터 없음 — "📋 재무 수집" 버튼을 눌러주세요</span>
            )}
            {fin && fin.count > 0 && (
              <span className="ml-2 text-gray-400 font-normal normal-case">{fin.count}개 종목 재무 데이터 보유</span>
            )}
          </span>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">매출 성장률</span>
            <NumInput value={revenueGrowthMin} onChange={setRevenueGrowthMin} placeholder="10" />
            <span className="text-xs text-gray-400">% 이상</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">영업이익 성장률</span>
            <NumInput value={opGrowthMin} onChange={setOpGrowthMin} placeholder="10" />
            <span className="text-xs text-gray-400">% 이상</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">영업이익률</span>
            <NumInput value={opMarginMin} onChange={setOpMarginMin} placeholder="5" />
            <span className="text-xs text-gray-400">% 이상</span>
          </div>
        </div>

        {hasAnyFilter && (
          <div className="flex justify-end pt-1">
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">전체 초기화</button>
          </div>
        )}
      </div>

      {/* ── 결과 테이블 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* 요약 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">
            {loading ? "검색 중..." : `${result?.total ?? 0}개 종목`}
            {result && !loading && (
              <span className="text-xs font-normal text-gray-400 ml-2">기준일 {fmtTime(result.collectedAt)}</span>
            )}
          </p>
          {hasFinancialFilter && fin?.count === 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
              재무 데이터 수집 후 이용 가능
            </span>
          )}
        </div>

        {/* 컬럼 헤더 */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1.8fr_1.5fr_auto] gap-x-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span>52주 고가 근접</span>
          <span className="text-center">재무 (YoY)</span>
          <span className="w-8" />
        </div>

        {/* 로딩 스켈레톤 */}
        {loading && (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1.8fr_1.5fr_auto] gap-x-3 px-5 py-3.5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="h-4 bg-gray-100 rounded w-3/4 ml-auto" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="h-4 bg-gray-100 rounded" />
                <div className="w-8" />
              </div>
            ))}
          </div>
        )}

        {/* 빈 결과 */}
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
              const isPos  = (item.changeRate ?? 0) >= 0;
              const ratio  = item.high52wRatio;
              const ratioColor =
                ratio >= 95 ? "#059669" : ratio >= 85 ? "#16a34a" : ratio >= 70 ? "#2563eb" : "#6b7280";
              const ratioBg =
                ratio >= 95 ? "#d1fae5" : ratio >= 85 ? "#dcfce7" : ratio >= 70 ? "#dbeafe" : "#f3f4f6";

              return (
                <div key={item.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1.8fr_1.5fr_auto] gap-x-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors items-center">

                  {/* 종목명 */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.market === "KOSPI" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                      }`}>{item.market}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {item.sector} · {item.id}
                      {item.period && <span className="ml-1 text-gray-300">· {item.period}</span>}
                    </p>
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
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: ratioColor, background: ratioBg }}>
                        {ratio}%
                      </span>
                      <span className="text-[11px] text-gray-400">고 {fmtPrice(item.high52w)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(ratio, 100)}%`, background: ratioColor }} />
                    </div>
                  </div>

                  {/* 재무 지표 */}
                  <div className="flex flex-col gap-1">
                    {item.revenueGrowth != null || item.opGrowth != null || item.opMargin != null ? (
                      <>
                        <FinBadge label="매출" value={item.revenueGrowth} suffix="%" isGrowth />
                        <FinBadge label="영업↑" value={item.opGrowth} suffix="%" isGrowth />
                        <FinBadge label="마진" value={item.opMargin} suffix="%" isGrowth={false} />
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-300">-</span>
                    )}
                  </div>

                  {/* 네이버 금융 링크 */}
                  <div className="w-8 flex justify-center">
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
      </div>

      <p className="text-xs text-gray-400 text-center pb-1">
        주가: Yahoo Finance 기준 / 재무: DART 사업보고서 기준 (전년도). 투자 결정의 근거로 사용하지 마세요.
      </p>
    </div>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────────────────

function NumInput({
  value, onChange, placeholder,
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      type="number" step="any" placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
    />
  );
}

function FinBadge({
  label, value, suffix, isGrowth,
}: {
  label: string; value: number | null; suffix: string; isGrowth: boolean;
}) {
  if (value == null) return null;
  const sign = isGrowth && value > 0 ? "+" : "";
  return (
    <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] ${growthBg(isGrowth ? value : null)}`}>
      <span className="text-gray-400">{label}</span>
      <span className={`font-bold ${isGrowth ? growthColor(value) : value >= 10 ? "text-emerald-600" : "text-gray-500"}`}>
        {sign}{value.toFixed(1)}{suffix}
      </span>
    </div>
  );
}
