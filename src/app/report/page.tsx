"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Report {
  id: string; date: string;
  kospi: number | null; kospiChange: number | null;
  kosdaq: number | null; kosdaqChange: number | null;
  krwUsd: number | null; krwUsdChange: number | null;
  sp500: number | null; sp500Change: number | null;
  vix: number | null;
  us10y: number | null; us10yChange: number | null;
  summaryKr: string | null; summaryUs: string | null;
  insightDcIrp: string | null;
  status: string; generatedAt: string;
}

function IndexChip({ label, value, change, unit = "" }: {
  label: string; value: number | null; change?: number | null; unit?: string;
}) {
  const pos = (change ?? 0) >= 0;
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold text-gray-800">
        {value != null ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) + unit : "–"}
      </span>
      {change != null && (
        <span className={`font-semibold ${pos ? "text-emerald-600" : "text-red-500"}`}>
          {pos ? "▲" : "▼"}{Math.abs(change)}%
        </span>
      )}
    </span>
  );
}

export default function ReportPage() {
  const [report,     setReport]     = useState<Report | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState("");

  async function fetchLatest() {
    const res = await fetch("/api/report");
    const data = await res.json();
    const latest = (data.reports ?? [])[0];
    if (!latest) { setLoading(false); return; }

    const res2 = await fetch(`/api/report/${latest.date.slice(0, 10)}`);
    const d2 = await res2.json();
    setReport(d2.report);
    setLoading(false);
  }

  useEffect(() => { fetchLatest(); }, []);

  async function handleGenerate() {
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/report", { method: "POST" });
      if (!res.ok) throw new Error("생성 실패");
      const d = await res.json();
      setReport(d.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    }
    setGenerating(false);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📰 시황 리포트</h1>
          <p className="text-sm text-gray-400 mt-0.5">한국·미국 주식 시황 AI 요약</p>
        </div>
        <div className="flex gap-2">
          <Link href="/report/history"
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
            히스토리
          </Link>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors">
            {generating
              ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />생성 중...</>
              : "↻ 오늘 리포트 생성"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>}

      {/* 로딩 */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse h-24" />
          ))}
        </div>
      )}

      {/* 리포트 없음 */}
      {!loading && !report && (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
          <p className="text-4xl mb-3">📰</p>
          <p className="text-gray-500 font-medium">아직 생성된 리포트가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">위 버튼을 눌러 오늘의 시황 리포트를 생성하세요</p>
        </div>
      )}

      {/* 리포트 본문 */}
      {!loading && report && (
        <>
          {/* 날짜 + 생성 시각 */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-700">
              {new Date(report.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
            </span>
            <span className="text-gray-400 text-xs">
              생성: {new Date(report.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              {report.date.slice(0, 10) !== today && (
                <span className="ml-2 text-amber-500">· 오늘 리포트 미생성</span>
              )}
            </span>
          </div>

          {/* 시장 지수 */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 space-y-1.5">
            <div className="grid grid-cols-[1.2rem_1fr_1fr_1fr] gap-x-3 items-center">
              <span className="text-xs text-gray-300">🇰🇷</span>
              <IndexChip label="KOSPI"  value={report.kospi}  change={report.kospiChange} />
              <IndexChip label="KOSDAQ" value={report.kosdaq} change={report.kosdaqChange} />
              <IndexChip label="환율"   value={report.krwUsd} change={report.krwUsdChange} unit="원" />
            </div>
            <div className="grid grid-cols-[1.2rem_1fr_1fr_1fr] gap-x-3 items-center">
              <span className="text-xs text-gray-300">🇺🇸</span>
              <IndexChip label="S&P500" value={report.sp500}  change={report.sp500Change} />
              <IndexChip label="VIX"    value={report.vix} />
              <IndexChip label="10Y"    value={report.us10y}  change={report.us10yChange} unit="%" />
            </div>
          </div>

          {/* AI 요약 */}
          {(report.summaryKr || report.summaryUs || report.insightDcIrp) ? (
            <div className="space-y-4">
              {report.summaryKr && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🇰🇷 한국 시황 요약</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{report.summaryKr.replace(/^.+\n/, "")}</p>
                </div>
              )}
              {report.summaryUs && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🇺🇸 미국 시황 요약</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{report.summaryUs.replace(/^.+\n/, "")}</p>
                </div>
              )}
              {report.insightDcIrp && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-blue-700 mb-2">💼 퇴직연금 시사점</h3>
                  <p className="text-sm text-blue-800 leading-relaxed">{report.insightDcIrp}</p>
                </div>
              )}
            </div>
          ) : report.status === "done" ? (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center text-sm text-gray-400">
              AI 요약을 생성하지 못했습니다. OPENROUTER_API_KEY를 확인해주세요.
            </div>
          ) : null}

          <p className="text-xs text-gray-300 text-center">
            본 리포트는 AI가 시장 데이터를 요약한 것으로 투자 권유가 아닙니다.
          </p>
        </>
      )}
    </div>
  );
}
