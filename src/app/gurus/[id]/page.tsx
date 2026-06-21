"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Holding {
  id: string; rank: number;
  ticker: string | null; company: string; cusip: string;
  shares: number; value: number; portfolioPct: number | null;
  changeType: string | null; changePct: number | null;
}

interface Changes { new: number; added: number; reduced: number; sold: number; unchanged: number; }

interface GuruDetail {
  guru: { id: string; name: string; fund: string; description: string };
  quarter: string | null;
  quarters: string[];
  holdings: Holding[];
  totalValueM:   number;
  totalAssetsM:  number | null;
  cashM:         number | null;
  assetsQuarter: string | null;
  changes: Changes | null;
}

type ChangeFilter = null | "new" | "added" | "reduced" | "sold";

const CHANGE_FILTERS: { key: ChangeFilter; label: string; activeCls: string }[] = [
  { key: null,      label: "전체",   activeCls: "bg-gray-700 text-white" },
  { key: "new",     label: "신규",   activeCls: "bg-emerald-500 text-white" },
  { key: "added",   label: "추가",   activeCls: "bg-blue-500 text-white" },
  { key: "reduced", label: "축소",   activeCls: "bg-orange-500 text-white" },
  { key: "sold",    label: "매도",   activeCls: "bg-red-500 text-white" },
];

const CHANGE_ROW: Record<string, string> = {
  new:     "bg-emerald-50",
  added:   "bg-blue-50",
  reduced: "bg-orange-50",
  sold:    "bg-red-50",
};

const CHANGE_BADGE: Record<string, { label: string; cls: string }> = {
  new:       { label: "NEW",  cls: "bg-emerald-100 text-emerald-700" },
  added:     { label: "↑ 추가", cls: "bg-blue-100 text-blue-700" },
  reduced:   { label: "↓ 축소", cls: "bg-orange-100 text-orange-700" },
  sold:      { label: "✕ 매도", cls: "bg-red-100 text-red-600" },
  unchanged: { label: "━",    cls: "bg-gray-100 text-gray-400" },
};

function fmtShares(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M주`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K주`;
  return `${v}주`;
}
function fmtValueM(v: number) {
  const m = v / 1_000_000;
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`;
  return `$${m.toFixed(0)}M`;
}

export default function GuruDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data,         setData]         = useState<GuruDetail | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [collecting,   setCollecting]   = useState(false);
  const [selQuarter,   setSelQuarter]   = useState<string | null>(null);
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>(null);

  const fetchData = useCallback(async (q?: string, cf?: ChangeFilter) => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (q)  sp.set("quarter", q);
    if (cf) sp.set("change", cf);
    const res = await fetch(`/api/gurus/${id}?${sp}`);
    const d   = await res.json();
    setData(d);
    if (!selQuarter && d.quarter) setSelQuarter(d.quarter);
    setLoading(false);
  }, [id, selQuarter]);

  useEffect(() => { fetchData(); }, [id]); // eslint-disable-line

  function handleQuarter(q: string) {
    setSelQuarter(q);
    setChangeFilter(null);
    fetchData(q, null);
  }

  function handleChangeFilter(cf: ChangeFilter) {
    setChangeFilter(cf);
    fetchData(selQuarter ?? undefined, cf);
  }

  async function handleCollect() {
    setCollecting(true);
    await fetch("/api/gurus/collect", {
      method: "POST",
      body: JSON.stringify({ id }),
      headers: { "Content-Type": "application/json" },
    });
    setCollecting(false);
    fetchData(selQuarter ?? undefined, changeFilter);
  }

  const guru    = data?.guru;
  const changes = data?.changes;

  return (
    <div className="space-y-6">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/gurus" className="hover:text-gray-600 transition-colors">투자 대가 13F</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{guru?.name ?? id}</span>
      </div>

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{guru?.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{guru?.fund}</p>
          {guru?.description && <p className="text-sm text-gray-500 mt-1">{guru.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleCollect} disabled={collecting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {collecting ? "수집 중..." : "↻ 수집"}
          </button>
        </div>
      </div>

      {/* 자산 요약 카드 */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 13F 포트폴리오 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">13F 포트폴리오</p>
            <p className="text-xl font-bold text-gray-900">
              {data.totalValueM >= 1000
                ? `$${(data.totalValueM / 1000).toFixed(1)}B`
                : `$${data.totalValueM}M`}
            </p>
            {data.quarter && <p className="text-[11px] text-gray-400 mt-0.5">{data.quarter} 기준</p>}
          </div>

          {/* 총자산 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">총자산</p>
            {data.totalAssetsM ? (
              <>
                <p className="text-xl font-bold text-gray-900">
                  {data.totalAssetsM >= 1000
                    ? `$${(data.totalAssetsM / 1000).toFixed(1)}B`
                    : `$${data.totalAssetsM}M`}
                </p>
                {data.assetsQuarter && <p className="text-[11px] text-gray-400 mt-0.5">{data.assetsQuarter} 기준</p>}
              </>
            ) : (
              <p className="text-sm text-gray-300 mt-1">사모펀드 비공개</p>
            )}
          </div>

          {/* 현금·단기투자 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">현금·단기투자</p>
            {data.cashM != null && data.cashM > 0 ? (
              <>
                <p className="text-xl font-bold text-blue-600">
                  {data.cashM >= 1000
                    ? `$${(data.cashM / 1000).toFixed(1)}B`
                    : `$${data.cashM}M`}
                </p>
                {data.assetsQuarter && <p className="text-[11px] text-gray-400 mt-0.5">{data.assetsQuarter} 기준</p>}
              </>
            ) : (
              <p className="text-sm text-gray-300 mt-1">사모펀드 비공개</p>
            )}
          </div>

          {/* 현금비중 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">현금비중</p>
            {data.totalAssetsM && data.cashM != null && data.cashM > 0 ? (
              <>
                <p className="text-xl font-bold text-emerald-600">
                  {(data.cashM / data.totalAssetsM * 100).toFixed(1)}%
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">현금 / 총자산</p>
              </>
            ) : (
              <p className="text-sm text-gray-300 mt-1">사모펀드 비공개</p>
            )}
          </div>
        </div>
      )}

      {/* 분기 탭 */}
      {data && data.quarters.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {data.quarters.map((q) => (
            <button key={q} onClick={() => handleQuarter(q)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                selQuarter === q ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>{q}</button>
          ))}
        </div>
      )}

      {/* 변동 요약 카드 */}
      {changes && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "new",     label: "신규 편입", color: "emerald", val: changes.new     },
            { key: "added",   label: "추가 매수", color: "blue",    val: changes.added   },
            { key: "reduced", label: "일부 매도", color: "orange",  val: changes.reduced },
            { key: "sold",    label: "전량 매도", color: "red",     val: changes.sold    },
          ].map(({ key, label, color, val }) => (
            <button key={key}
              onClick={() => handleChangeFilter(changeFilter === key as ChangeFilter ? null : key as ChangeFilter)}
              className={`rounded-xl p-3 text-center transition-all border ${
                changeFilter === key
                  ? `border-${color}-300 bg-${color}-50`
                  : "border-gray-100 bg-white hover:border-gray-200"
              }`}>
              <p className={`text-2xl font-bold text-${color}-600`}>{val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* 변동 필터 탭 */}
      {data && data.holdings.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs text-gray-400 mr-1">필터</span>
          {CHANGE_FILTERS.map(({ key, label, activeCls }) => (
            <button key={String(key)} onClick={() => handleChangeFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                changeFilter === key ? activeCls : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>{label}</button>
          ))}
        </div>
      )}

      {/* 데이터 없음 */}
      {!loading && (!data?.holdings || data.holdings.length === 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
          <p className="text-gray-400">{changeFilter ? "해당 변동 종목이 없습니다." : "데이터가 없습니다."}</p>
          {!changeFilter && <p className="text-sm text-gray-300 mt-1">수집 버튼을 눌러 13F 데이터를 가져오세요.</p>}
        </div>
      )}

      {/* 보유 종목 테이블 */}
      {!loading && data && data.holdings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span className="font-semibold text-gray-700">
              {data.quarter} {changeFilter ? `— ${CHANGE_FILTERS.find(f => f.key === changeFilter)?.label}` : "보유 현황"}
            </span>
            <span>{data.holdings.length}개 종목</span>
          </div>

          {/* 가로 스크롤 래퍼 */}
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">

          {/* 컬럼 헤더 */}
          <div className="grid grid-cols-[2rem_1fr_2fr_1fr_1fr_1fr_5rem] gap-x-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <span>#</span>
            <span>티커</span>
            <span>종목명</span>
            <span className="text-right">비중</span>
            <span className="text-right">평가액</span>
            <span className="text-right">주식수</span>
            <span className="text-center">변동</span>
          </div>

          <div className="divide-y divide-gray-50">
            {data.holdings.map((h) => {
              const ct    = h.changeType ?? "unchanged";
              const badge = CHANGE_BADGE[ct] ?? CHANGE_BADGE.unchanged;
              const rowCls = CHANGE_ROW[ct] ?? "";
              const isSold = ct === "sold";

              return (
                <div key={h.id}
                  className={`grid grid-cols-[2rem_1fr_2fr_1fr_1fr_1fr_5rem] gap-x-3 px-5 py-3 transition-colors items-center text-sm ${rowCls || "hover:bg-gray-50/70"}`}>
                  <span className="text-xs text-gray-300 font-mono">{isSold ? "–" : h.rank}</span>

                  {h.ticker ? (
                    <a href={`https://finance.yahoo.com/quote/${h.ticker}`}
                      target="_blank" rel="noopener noreferrer"
                      className={`font-bold hover:underline ${isSold ? "text-gray-400 line-through" : "text-blue-600 hover:text-blue-700"}`}>
                      {h.ticker}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs font-normal">–</span>
                  )}

                  <span className={`truncate text-xs ${isSold ? "text-gray-400" : "text-gray-600"}`}>{h.company}</span>

                  <div className="text-right">
                    {!isSold && h.portfolioPct != null
                      ? <span className="font-semibold text-gray-800">{h.portfolioPct.toFixed(2)}%</span>
                      : <span className="text-gray-300">–</span>}
                  </div>

                  <span className="text-right text-gray-600 text-xs">
                    {isSold ? <span className="text-red-400">전량 매도</span> : fmtValueM(h.value)}
                  </span>

                  <span className="text-right text-gray-500 text-xs">
                    {isSold ? "–" : fmtShares(h.shares)}
                  </span>

                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    {h.changePct != null && !isSold && (
                      <span className="text-[9px] text-gray-400">{h.changePct > 0 ? "+" : ""}{h.changePct}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

            </div>{/* min-w-[560px] */}
          </div>{/* overflow-x-auto */}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">SEC EDGAR 13F-HR 공시 데이터 · 분기 종료 후 45일 이내 공시</p>
    </div>
  );
}
