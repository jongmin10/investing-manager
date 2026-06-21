"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Changes { new: number; added: number; reduced: number; sold: number; unchanged: number; }

interface GuruSummary {
  id: string; name: string; fund: string; description: string;
  latestQuarter: string | null;
  holdingsCount: number;
  totalValueM: number;
  topHoldings: { ticker: string; company: string; portfolioPct: number | null }[];
  changes: Changes | null;
  updatedAt: string | null;
}

function fmtValueB(m: number) {
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`;
  return `$${m}M`;
}

export default function GurusPage() {
  const [gurus,      setGurus]      = useState<GuruSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [status,     setStatus]     = useState<Record<string, string>>({});

  async function fetchGurus() {
    setLoading(true);
    const res = await fetch("/api/gurus");
    const data = await res.json();
    setGurus(data.gurus ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchGurus(); }, []);

  async function handleCollectAll() {
    setCollecting(true);
    setStatus({});
    // Vercel 타임아웃 대응: 대가 1명씩 순차 수집
    const { ids } = await fetch("/api/gurus/collect", {
      method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" },
    }).then((r) => r.json());

    for (const id of (ids ?? [])) {
      setStatus((prev) => ({ ...prev, [id]: "수집 중..." }));
      try {
        const res  = await fetch("/api/gurus/collect", {
          method: "POST", body: JSON.stringify({ id }), headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        setStatus((prev) => ({ ...prev, [id]: data.ok ? `✓ ${data.quarter} (${data.count}개)` : `✗ ${data.error ?? "오류"}` }));
      } catch {
        setStatus((prev) => ({ ...prev, [id]: "✗ 네트워크 오류" }));
      }
    }
    setCollecting(false);
    fetchGurus();
  }

  async function handleCollectOne(id: string) {
    setStatus((prev) => ({ ...prev, [id]: "수집 중..." }));
    const res  = await fetch("/api/gurus/collect", { method: "POST", body: JSON.stringify({ id }), headers: { "Content-Type": "application/json" } });
    const data = await res.json();
    setStatus((prev) => ({ ...prev, [id]: data.ok ? `✓ ${data.quarter} (${data.count}개)` : `✗ ${data.error}` }));
    fetchGurus();
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏆 투자 대가 13F</h1>
          <p className="text-sm text-gray-500 mt-0.5">미국 SEC 13F 공시 기반 포트폴리오 — 분기별 업데이트</p>
        </div>
        <button onClick={handleCollectAll} disabled={collecting}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
          {collecting
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />전체 수집 중...</>
            : "↻ 전체 수집"}
        </button>
      </div>

      {/* 카드 그리드 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {gurus.map((guru) => (
            <div key={guru.id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              {/* 이름 + 펀드 */}
              <div>
                <Link href={`/gurus/${guru.id}`} className="text-base font-bold text-gray-900 hover:text-blue-600 transition-colors">
                  {guru.name}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">{guru.fund}</p>
              </div>

              {/* 설명 */}
              <p className="text-xs text-gray-500 leading-relaxed">{guru.description}</p>

              {/* 분기 + 규모 */}
              {guru.latestQuarter ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">
                    {guru.latestQuarter}
                  </span>
                  <span className="text-gray-500">{fmtValueB(guru.totalValueM)} · {guru.holdingsCount}종목</span>
                </div>
              ) : (
                <div className="text-xs text-amber-500 bg-amber-50 rounded-lg px-2.5 py-1.5 text-center">
                  데이터 없음 — 수집 필요
                </div>
              )}

              {/* 변동 배지 */}
              {guru.changes && (guru.changes.new + guru.changes.added + guru.changes.reduced + guru.changes.sold > 0) && (
                <div className="flex flex-wrap gap-1">
                  {guru.changes.new     > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">신규 {guru.changes.new}</span>}
                  {guru.changes.added   > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">추가 {guru.changes.added}</span>}
                  {guru.changes.reduced > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">축소 {guru.changes.reduced}</span>}
                  {guru.changes.sold    > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">매도 {guru.changes.sold}</span>}
                </div>
              )}

              {/* 상위 3개 종목 */}
              {guru.topHoldings.length > 0 && (
                <div className="space-y-1">
                  {guru.topHoldings.map((h) => (
                    <div key={h.ticker} className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-gray-700">{h.ticker}</span>
                      <span className="text-gray-400">{h.portfolioPct?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 하단 버튼 */}
              <div className="flex items-center justify-between mt-auto pt-1">
                {status[guru.id] ? (
                  <span className={`text-[11px] ${status[guru.id].startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
                    {status[guru.id]}
                  </span>
                ) : (
                  <button onClick={() => handleCollectOne(guru.id)}
                    className="text-[11px] text-gray-400 hover:text-blue-500 transition-colors underline">
                    수집
                  </button>
                )}
                {guru.latestQuarter && (
                  <Link href={`/gurus/${guru.id}`}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                    상세 →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        13F 공시는 분기 종료 후 45일 이내 제출 · SEC EDGAR 공식 데이터
      </p>
    </div>
  );
}
