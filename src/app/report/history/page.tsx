"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ReportItem {
  id: string; date: string; status: string;
  kospi: number | null; kospiChange: number | null;
  sp500: number | null; sp500Change: number | null;
}

export default function ReportHistoryPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then((d) => { setReports(d.reports ?? []); setLoading(false); });
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/report" className="hover:text-gray-600 transition-colors">시황 리포트</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">히스토리</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">📅 리포트 히스토리</h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-gray-400">생성된 리포트가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const dateStr = new Date(r.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
            return (
              <Link key={r.id} href={`/report/${r.date.slice(0, 10)}`}
                className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-5 py-4 hover:shadow-sm hover:border-gray-200 transition-all">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{dateStr}</p>
                  {r.status !== "done" && (
                    <span className="text-xs text-amber-500">{r.status === "failed" ? "생성 실패" : "생성 중"}</span>
                  )}
                </div>
                {r.status === "done" && (
                  <div className="flex gap-4 text-xs text-gray-500">
                    {r.kospi && (
                      <span>KOSPI {r.kospi.toLocaleString()}
                        {r.kospiChange != null && (
                          <span className={r.kospiChange >= 0 ? "text-emerald-500 ml-1" : "text-red-500 ml-1"}>
                            {r.kospiChange >= 0 ? "▲" : "▼"}{Math.abs(r.kospiChange)}%
                          </span>
                        )}
                      </span>
                    )}
                    {r.sp500 && (
                      <span>S&P {r.sp500.toLocaleString()}
                        {r.sp500Change != null && (
                          <span className={r.sp500Change >= 0 ? "text-emerald-500 ml-1" : "text-red-500 ml-1"}>
                            {r.sp500Change >= 0 ? "▲" : "▼"}{Math.abs(r.sp500Change)}%
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
