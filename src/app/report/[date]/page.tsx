"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

export default function ReportDatePage() {
  const { date } = useParams<{ date: string }>();
  const [report,  setReport]  = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/report/${date}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => { if (d) setReport(d.report); setLoading(false); });
  }, [date]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (notFound || !report) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400 text-lg">해당 날짜의 리포트가 없습니다.</p>
        <Link href="/report/history" className="mt-4 inline-block text-blue-500 hover:underline text-sm">← 히스토리로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/report" className="hover:text-gray-600 transition-colors">시황 리포트</Link>
        <span>/</span>
        <Link href="/report/history" className="hover:text-gray-600 transition-colors">히스토리</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{date}</span>
      </div>

      {/* 날짜 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📰 시황 리포트</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(report.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
        <span className="text-xs text-gray-400">
          생성: {new Date(report.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
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

      <p className="text-xs text-gray-300 text-center">본 리포트는 AI가 시장 데이터를 요약한 것으로 투자 권유가 아닙니다.</p>
    </div>
  );
}
