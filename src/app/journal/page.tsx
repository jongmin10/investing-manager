"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getMood, getDecisionType } from "@/lib/journal-constants";

interface EntryItem {
  id: string; date: string; title: string;
  mood: string | null; decisionType: string | null; tickers: string | null;
}

function fmtDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

export default function JournalPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/journal")
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries ?? []); setLoading(false); });
  }, [status]);

  if (status === "loading" || status === "unauthenticated") {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📔 투자 일기</h1>
          <p className="text-sm text-gray-400 mt-0.5">나의 투자 기록과 당시 생각을 남겨두세요</p>
        </div>
        <Link href="/journal/new"
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors">
          + 새 일기
        </Link>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse space-y-2">
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-5 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center">
          <p className="text-4xl mb-3">📔</p>
          <p className="text-gray-500 font-medium">아직 작성된 일기가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">첫 번째 투자 일기를 작성해보세요</p>
          <Link href="/journal/new"
            className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors">
            일기 작성하기
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const mood = getMood(e.mood);
            const dt   = getDecisionType(e.decisionType);
            const tickers: string[] = e.tickers ? JSON.parse(e.tickers) : [];

            return (
              <Link key={e.id} href={`/journal/${e.id}`}
                className="block bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{fmtDate(e.date)}</p>
                    <p className="font-semibold text-gray-900 truncate">{e.title}</p>
                    {/* 배지 */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {dt && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${dt.color}`}>
                          {dt.label}
                        </span>
                      )}
                      {tickers.map((t) => (
                        <span key={t} className="text-[11px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {mood && (
                    <span className="text-2xl flex-shrink-0">{mood.emoji}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
