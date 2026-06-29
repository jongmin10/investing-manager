"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getMood, getDecisionType } from "@/lib/journal-constants";

interface Entry {
  id: string; date: string; title: string; body: string;
  mood: string | null; decisionType: string | null; tickers: string[];
  snapshotKospi: number | null; snapshotSp500: number | null;
  snapshotKrwUsd: number | null; snapshotUs10y: number | null;
  createdAt: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

export default function JournalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [entry,   setEntry]   = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/journal/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setEntry(d.entry); setLoading(false); });
  }, [id, status]);

  async function handleDelete() {
    if (!confirm("이 일기를 삭제할까요?")) return;
    setDeleting(true);
    await fetch(`/api/journal/${id}`, { method: "DELETE" });
    router.push("/journal");
  }

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!entry) return <div className="max-w-3xl mx-auto text-center text-gray-400">일기를 찾을 수 없습니다.</div>;

  const mood = getMood(entry.mood);
  const dt   = getDecisionType(entry.decisionType);
  const hasSnapshot = entry.snapshotKospi || entry.snapshotSp500 || entry.snapshotKrwUsd || entry.snapshotUs10y;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/journal" className="hover:text-gray-600 transition-colors">투자 일기</Link>
        <span>/</span>
        <span className="text-gray-700 truncate">{entry.title}</span>
      </div>

      {/* 헤더 카드 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-400 mb-1">{fmtDate(entry.date)}</p>
            <h1 className="text-xl font-bold text-gray-900">{entry.title}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              {mood && (
                <span className={`flex items-center gap-1 text-sm px-3 py-1 rounded-full border ${mood.color}`}>
                  {mood.emoji} {mood.label}
                </span>
              )}
              {dt && (
                <span className={`text-sm font-semibold px-3 py-1 rounded-full ${dt.color}`}>{dt.label}</span>
              )}
              {entry.tickers.map((t) => (
                <span key={t} className="text-xs font-mono bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{t}</span>
              ))}
            </div>
          </div>
          {mood && <span className="text-4xl flex-shrink-0">{mood.emoji}</span>}
        </div>
      </div>

      {/* 시장 스냅샷 */}
      {hasSnapshot && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-blue-600 mb-2">📌 작성 시점 시장 스냅샷</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {entry.snapshotKospi  && <div><p className="text-xs text-gray-400">KOSPI</p>  <p className="font-bold text-gray-800">{entry.snapshotKospi.toLocaleString()}</p></div>}
            {entry.snapshotSp500  && <div><p className="text-xs text-gray-400">S&P500</p> <p className="font-bold text-gray-800">{entry.snapshotSp500.toLocaleString()}</p></div>}
            {entry.snapshotKrwUsd && <div><p className="text-xs text-gray-400">환율</p>   <p className="font-bold text-gray-800">{entry.snapshotKrwUsd.toLocaleString()}원</p></div>}
            {entry.snapshotUs10y  && <div><p className="text-xs text-gray-400">미국채10Y</p><p className="font-bold text-gray-800">{entry.snapshotUs10y.toFixed(2)}%</p></div>}
          </div>
        </div>
      )}

      {/* 본문 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        {entry.body ? (
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
        ) : (
          <p className="text-gray-300 italic">내용 없음</p>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-2">
        <Link href={`/journal/${id}/edit`}
          className="flex-1 py-2.5 text-center border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors">
          수정
        </Link>
        <button onClick={handleDelete} disabled={deleting}
          className="flex-1 py-2.5 border border-red-200 hover:bg-red-50 text-red-500 text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
          {deleting ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </div>
  );
}
