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
  cnsEps: number | null;
  per: number | null; cnsPer: number | null; pbr: number | null; dividendYield: number | null;
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

type SortKey = "high52wRatio" | "changeRate" | "price" | "volume" | "revenueGrowth" | "opGrowth" | "netGrowth" | "revenue";
type Market   = "ALL" | "KOSPI" | "KOSDAQ";
type RatePreset = "" | "up" | "down" | "surge" | "plunge" | "custom";

const MARKET_OPTIONS: { key: Market; label: string }[] = [
  { key: "ALL",    label: "전체"   },
  { key: "KOSPI",  label: "코스피" },
  { key: "KOSDAQ", label: "코스닥" },
];

const RATE_PRESETS: { key: RatePreset; label: string; min: string; max: string }[] = [
  { key: "",       label: "전체",     min: "",   max: ""   },
  { key: "up",     label: "상승",     min: "0",  max: ""   },
  { key: "down",   label: "하락",     min: "",   max: "0"  },
  { key: "surge",  label: "급등 3%+", min: "3",  max: ""   },
  { key: "plunge", label: "급락 3%-", min: "",   max: "-3" },
  { key: "custom", label: "직접 입력", min: "",  max: ""   },
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
function fmtRevenue(v: number | null) {
  if (v == null) return null;
  if (v >= 10_000) return (v / 10_000).toFixed(0) + "조";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "억";
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
  const [result,              setResult]              = useState<ScreenerResult | null>(null);
  const [loading,             setLoading]             = useState(true);
  const [collecting,          setCollecting]          = useState(false);
  const [financialCollecting, setFinancialCollecting] = useState(false);

  // ── 필터 상태 ─────────────────────────────────────────
  const [market,           setMarket]           = useState<Market>("ALL");
  const [sector,           setSector]           = useState("");
  const [use52w,           setUse52w]           = useState(false);
  const [high52wMin,       setHigh52wMin]       = useState(80);
  const [ratePreset,       setRatePreset]       = useState<RatePreset>("");
  const [changeRateMin,    setChangeRateMin]    = useState("");
  const [changeRateMax,    setChangeRateMax]    = useState("");
  const [volumeMin,        setVolumeMin]        = useState("");        // A: 거래량 최소
  const [profitableOnly,   setProfitableOnly]   = useState(false);    // A: 흑자 토글
  const [revenueMin,       setRevenueMin]       = useState("");        // A: 매출 규모 최소
  const [revenueGrowthMin, setRevenueGrowthMin] = useState("");
  const [opGrowthMin,      setOpGrowthMin]      = useState("");
  const [netGrowthMin,     setNetGrowthMin]     = useState("");        // A: 순이익 성장률
  const [opMarginMin,      setOpMarginMin]      = useState("");
  const [dividendYieldMin, setDividendYieldMin] = useState("");
  const [sortBy,           setSortBy]           = useState<SortKey>("high52wRatio");

  // 등락률 프리셋 선택 시 min/max 자동 설정
  function handleRatePreset(key: RatePreset) {
    setRatePreset(key);
    const preset = RATE_PRESETS.find((p) => p.key === key);
    if (preset && key !== "custom") {
      setChangeRateMin(preset.min);
      setChangeRateMax(preset.max);
    }
  }

  const hasFinancialFilter = revenueGrowthMin || opGrowthMin || netGrowthMin || opMarginMin || profitableOnly || revenueMin || dividendYieldMin;
  const hasAnyFilter = sector || use52w || ratePreset !== "" || volumeMin ||
    revenueGrowthMin || opGrowthMin || netGrowthMin || opMarginMin || dividendYieldMin ||
    profitableOnly || revenueMin || market !== "ALL";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("market", market);
    if (sector)                     p.set("sector", sector);
    if (use52w && high52wMin > 0)   p.set("high52wMin", String(high52wMin));
    if (changeRateMin)              p.set("changeRateMin", changeRateMin);
    if (changeRateMax)              p.set("changeRateMax", changeRateMax);
    if (volumeMin)                  p.set("volumeMin", volumeMin);
    if (profitableOnly)             p.set("profitableOnly", "true");
    if (revenueMin)                 p.set("revenueMin", revenueMin);
    if (revenueGrowthMin)           p.set("revenueGrowthMin", revenueGrowthMin);
    if (opGrowthMin)                p.set("opGrowthMin", opGrowthMin);
    if (netGrowthMin)               p.set("netGrowthMin", netGrowthMin);
    if (opMarginMin)                p.set("opMarginMin", opMarginMin);
    if (dividendYieldMin)           p.set("dividendYieldMin", dividendYieldMin);
    p.set("sortBy", sortBy);

    const res  = await fetch(`/api/screener?${p}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }, [market, sector, use52w, high52wMin, changeRateMin, changeRateMax,
      volumeMin, profitableOnly, revenueMin,
      revenueGrowthMin, opGrowthMin, netGrowthMin, opMarginMin, dividendYieldMin, sortBy]);

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
    setRatePreset(""); setChangeRateMin(""); setChangeRateMax("");
    setVolumeMin(""); setProfitableOnly(false); setRevenueMin("");
    setRevenueGrowthMin(""); setOpGrowthMin(""); setNetGrowthMin(""); setOpMarginMin(""); setDividendYieldMin("");
  }

  const fin     = result?.financialStatus;
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
          {result && (
            <span className={`text-xs px-2.5 py-1 rounded-full border ${
              result.isUpToDate
                ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                : "bg-amber-50 border-amber-100 text-amber-600"
            }`}>
              {result.isUpToDate ? "✓ 오늘 수집" : `마지막 ${fmtTime(result.collectedAt)}`}
            </span>
          )}
          <div className="relative group">
            <button onClick={handleCollect} disabled={collecting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors">
              {collecting
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />수집 중...</>
                : "↻ 주가 수집"}
            </button>
            <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 bg-gray-900 text-white text-[11px] rounded-xl shadow-xl p-3 pointer-events-none">
              <div className="absolute -top-1.5 right-4 w-3 h-3 bg-gray-900 rotate-45 rounded-sm" />
              <p className="font-semibold text-white mb-1.5">주가 수집 항목</p>
              <ul className="space-y-0.5 text-gray-300">
                <li>· 현재가 · 등락률 · 거래량</li>
                <li>· 52주 최고가 · 최저가</li>
                <li>· PER(TTM) · 추정PER · 추정EPS</li>
                <li>· PBR · 배당수익률</li>
              </ul>
              <p className="mt-1.5 text-gray-400">Yahoo Finance + NAVER Finance</p>
            </div>
          </div>
          <div className="relative group">
            <button onClick={handleFinancialCollect} disabled={financialCollecting}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors disabled:opacity-50 ${
                fin?.hasDartKey ? "border-violet-200 text-violet-600 hover:bg-violet-50" : "border-gray-200 text-gray-400 cursor-not-allowed"
              }`}>
              {financialCollecting
                ? <><span className="w-3 h-3 border-2 border-violet-300/40 border-t-violet-500 rounded-full animate-spin" />수집 중...</>
                : <>📋 재무 수집 {fin ? `(${fin.count}개)` : ""}</>}
            </button>
            {/* 호버 툴팁 */}
            <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 bg-gray-900 text-white text-[11px] rounded-xl shadow-xl p-3 pointer-events-none">
              <div className="absolute -top-1.5 right-4 w-3 h-3 bg-gray-900 rotate-45 rounded-sm" />
              {fin?.hasDartKey ? (
                <>
                  <p className="font-semibold text-white mb-1.5">DART 재무 수집 항목</p>
                  <ul className="space-y-0.5 text-gray-300">
                    <li>· 매출 / 영업이익 / 순이익</li>
                    <li>· 매출·영업이익·순이익 성장률</li>
                    <li>· 영업이익률</li>
                    <li>· EPS · BPS · DPS</li>
                  </ul>
                  <p className="mt-1.5 text-gray-400">사업보고서 기준 연간 데이터</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-400 mb-1.5">⚠ DART_API_KEY 필요</p>
                  <ol className="space-y-0.5 text-gray-300 list-decimal list-inside">
                    <li>opendart.fss.or.kr 키 발급</li>
                    <li>.env 에 DART_API_KEY=키 추가</li>
                    <li>서버 재시작</li>
                  </ol>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 필터 패널 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">

        {/* 행 1: 시장 · 업종 · 정렬 */}
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
              <option value="volume">거래량 높은순</option>
              <option value="revenue">매출 규모 높은순</option>
              <option value="revenueGrowth">매출 성장률 높은순</option>
              <option value="opGrowth">영업이익 성장률 높은순</option>
              <option value="netGrowth">순이익 성장률 높은순</option>
            </select>
          </div>
        </div>

        {/* 행 2: 가격 조건 */}
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">가격 조건</p>
          <div className="flex flex-wrap items-center gap-5">
            {/* 52주 신고가 */}
            <div className="flex items-center gap-3">
              <div onClick={() => setUse52w((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${use52w ? "bg-blue-500" : "bg-gray-200"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${use52w ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-xs font-medium text-gray-700 cursor-pointer" onClick={() => setUse52w((v) => !v)}>52주 신고가</span>
              {use52w && (
                <div className="flex items-center gap-2">
                  <input type="range" min={50} max={100} step={1} value={high52wMin}
                    onChange={(e) => setHigh52wMin(Number(e.target.value))}
                    className="w-24 accent-blue-500" />
                  <span className="text-sm font-bold text-blue-600 w-16">{high52wMin}% 이상</span>
                </div>
              )}
            </div>

            {/* 등락률 퀵 버튼 (A: 개선) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">등락률</span>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {RATE_PRESETS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleRatePreset(key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      ratePreset === key ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              {ratePreset === "custom" && (
                <div className="flex items-center gap-1">
                  <NumInput value={changeRateMin} onChange={setChangeRateMin} placeholder="-10" width="w-16" />
                  <span className="text-xs text-gray-400">~</span>
                  <NumInput value={changeRateMax} onChange={setChangeRateMax} placeholder="+10" width="w-16" />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              )}
            </div>
          </div>

          {/* 거래량 최소 (A: 신규) */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500">거래량 최소</span>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {[
                { label: "제한 없음", val: "" },
                { label: "1만주+",   val: "10000" },
                { label: "10만주+",  val: "100000" },
                { label: "100만주+", val: "1000000" },
              ].map(({ label, val }) => (
                <button key={val} onClick={() => setVolumeMin(val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    volumeMin === val ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 행 3: 재무 조건 */}
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">재무 조건</p>
            {fin && fin.count > 0 && (
              <span className="text-[11px] text-gray-400">{fin.count}개 종목 재무 데이터 보유</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* 영업이익 흑자 토글 (A: 신규) */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setProfitableOnly((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${profitableOnly ? "bg-emerald-500" : "bg-gray-200"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${profitableOnly ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-xs font-medium text-gray-700">영업이익 흑자만</span>
            </label>

            {/* 매출 규모 (A: 신규) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">매출 규모</span>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {[
                  { label: "제한 없음", val: "" },
                  { label: "1천억+",   val: "1000" },
                  { label: "1조+",     val: "10000" },
                  { label: "10조+",    val: "100000" },
                ].map(({ label, val }) => (
                  <button key={val} onClick={() => setRevenueMin(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      revenueMin === val ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 성장률 입력 */}
          <div className="flex flex-wrap items-center gap-4">
            <FilterInput label="매출 성장" value={revenueGrowthMin} onChange={setRevenueGrowthMin} />
            <FilterInput label="영업이익 성장" value={opGrowthMin} onChange={setOpGrowthMin} />
            <FilterInput label="순이익 성장" value={netGrowthMin} onChange={setNetGrowthMin} />
            <FilterInput label="영업이익률" value={opMarginMin} onChange={setOpMarginMin} />
            <FilterInput label="배당수익률" value={dividendYieldMin} onChange={setDividendYieldMin} />
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
        <div className="grid grid-cols-[2fr_1fr_1fr_1.8fr_1.5fr_1.5fr_auto] gap-x-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span>52주 고가 근접</span>
          <span className="text-center">재무 (YoY)</span>
          <span className="text-center">가치지표</span>
          <span className="w-8" />
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1.8fr_1.5fr_1.5fr_auto] gap-x-3 px-5 py-3.5 animate-pulse">
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
              const isPos = (item.changeRate ?? 0) >= 0;
              const ratio = item.high52wRatio;
              const ratioColor =
                ratio >= 95 ? "#059669" : ratio >= 85 ? "#16a34a" : ratio >= 70 ? "#2563eb" : "#6b7280";
              const ratioBg =
                ratio >= 95 ? "#d1fae5" : ratio >= 85 ? "#dcfce7" : ratio >= 70 ? "#dbeafe" : "#f3f4f6";

              return (
                <div key={item.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1.8fr_1.5fr_1.5fr_auto] gap-x-3 px-5 py-3.5 hover:bg-gray-50/70 transition-colors items-center">

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
                      {item.revenue && <span className="ml-1 text-gray-300">· {fmtRevenue(item.revenue)}</span>}
                    </p>
                  </div>

                  {/* 현재가 */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{fmtPrice(item.price)}</p>
                    {item.volume != null && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmtVolume(item.volume)}</p>
                    )}
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
                        style={{ color: ratioColor, background: ratioBg }}>{ratio}%</span>
                      <span className="text-[11px] text-gray-400">고 {fmtPrice(item.high52w)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(ratio, 100)}%`, background: ratioColor }} />
                    </div>
                  </div>

                  {/* 재무 지표 */}
                  {(() => {
                    const FIN_SECTORS = ["금융", "보험", "은행", "증권"];
                    const isFinancial = FIN_SECTORS.some(s => item.sector?.includes(s));
                    return (
                      <div className="flex flex-col gap-0.5">
                        <FinBadge label="매출"   value={item.revenueGrowth} isGrowth
                          nullReason={item.revenue == null
                            ? (isFinancial ? "금융업 특성" : "데이터없음") : "미산출"} />
                        <FinBadge label="영업↑"  value={item.opGrowth}      isGrowth nullReason="미산출" />
                        <FinBadge label="순이익" value={item.netGrowth}     isGrowth nullReason="미산출" />
                        <FinBadge label="마진"   value={item.opMargin}      isGrowth={false} nullReason="미산출" />
                      </div>
                    );
                  })()}

                  {/* 가치지표: PER·EPS·PBR·배당수익률 */}
                  <div className="flex flex-col gap-0.5">
                    <ValBadge label="PER"    value={item.per}    unit="x"  low nullReason="적자/미제공" />
                    <ValBadge label="추정PER" value={item.cnsPer} unit="x"  low nullReason="추정치없음" estimate />
                    <ValBadge label="추정EPS" value={item.cnsEps} unit="원" won nullReason="추정치없음" estimate />
                    <ValBadge label="PBR"  value={item.pbr}          unit="x"  low nullReason="주식수미확인" />
                    <ValBadge label="배당수익률" value={item.dividendYield} unit="%" nullReason="무배당" />
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

function NumInput({ value, onChange, placeholder, width = "w-20" }: {
  value: string; onChange: (v: string) => void; placeholder: string; width?: string;
}) {
  return (
    <input type="number" step="any" placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300`}
    />
  );
}

function FilterInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
      <NumInput value={value} onChange={onChange} placeholder="0" width="w-16" />
      <span className="text-xs text-gray-400">% 이상</span>
    </div>
  );
}

// 가치지표 배지: PER·EPS·PBR·배당수익률
function ValBadge({
  label, value, unit, low = false, raw = false, won = false, nullReason, estimate = false,
}: {
  label: string; value: number | null; unit: string;
  low?: boolean; raw?: boolean; won?: boolean; nullReason?: string | null; estimate?: boolean;
}) {
  if (value == null) {
    return (
      <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-50/60">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-300 text-[9px] italic">{nullReason ?? "-"}</span>
      </div>
    );
  }
  let display: string;
  if (won) {
    display = value % 1 === 0
      ? value.toLocaleString("ko-KR")
      : value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (raw) {
    display = value >= 10_000
      ? (value / 10_000).toFixed(0) + "만"
      : value.toLocaleString("ko-KR");
  } else {
    display = value.toFixed(2);
  }
  const color = raw ? "text-gray-600"
    : low
      ? (value < 10 ? "text-emerald-600" : value < 20 ? "text-blue-500" : "text-gray-500")
      : (value >= 3 ? "text-emerald-600" : value >= 1 ? "text-blue-500" : "text-gray-400");
  return (
    <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] ${estimate ? "bg-amber-50 border border-amber-100" : "bg-gray-50"}`}>
      <span className={estimate ? "text-amber-500" : "text-gray-400"}>{label}</span>
      <span className={`font-bold ${color}`}>{display}{unit}</span>
    </div>
  );
}

function FinBadge({ label, value, isGrowth, nullReason }: {
  label: string; value: number | null; isGrowth: boolean; nullReason?: string;
}) {
  if (value == null) {
    return (
      <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-50/60">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-300 text-[9px] italic">{nullReason ?? "-"}</span>
      </div>
    );
  }
  const capped  = isGrowth && value > 999;
  const display = capped ? "999%+" : (isGrowth && value > 0 ? "+" : "") + value.toFixed(1) + "%";
  const color   = isGrowth
    ? growthColor(capped ? 999 : value)
    : value >= 10 ? "text-emerald-600" : value < 0 ? "text-red-400" : "text-gray-500";
  const bg      = isGrowth ? growthBg(capped ? 999 : value) : "";
  return (
    <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] ${bg || "bg-gray-50/60"}`}>
      <span className="text-gray-400">{label}</span>
      <span className={`font-bold ${color}`}>{display}</span>
    </div>
  );
}
