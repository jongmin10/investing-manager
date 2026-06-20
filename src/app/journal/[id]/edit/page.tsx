"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import JournalForm from "../../_form";

interface Entry {
  date: string; title: string; body: string;
  mood: string | null; decisionType: string | null; tickers: string[];
  snapshotKospi: number | null; snapshotSp500: number | null;
  snapshotKrwUsd: number | null; snapshotUs10y: number | null;
}

export default function EditJournalPage() {
  const { id } = useParams<{ id: string }>();
  const { status } = useSession();
  const router = useRouter();
  const [entry,   setEntry]   = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/journal/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setEntry(d.entry); setLoading(false); });
  }, [id, status]);

  async function handleSubmit(values: Parameters<typeof JournalForm>[0]["onSubmit"] extends (v: infer V) => unknown ? V : never) {
    const res = await fetch(`/api/journal/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "저장 실패");
    }
    router.push(`/journal/${id}`);
  }

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!entry) return <div className="max-w-3xl mx-auto px-4 py-8 text-center text-gray-400">일기를 찾을 수 없습니다.</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/journal" className="hover:text-gray-600 transition-colors">투자 일기</Link>
        <span>/</span>
        <Link href={`/journal/${id}`} className="hover:text-gray-600 transition-colors">{entry.title}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">수정</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">📔 일기 수정</h1>
      <JournalForm
        initial={{
          date:         entry.date.slice(0, 10),
          title:        entry.title,
          body:         entry.body,
          mood:         entry.mood ?? "",
          decisionType: entry.decisionType ?? "",
          tickers:      entry.tickers,
          snapshotKospi:  entry.snapshotKospi,
          snapshotSp500:  entry.snapshotSp500,
          snapshotKrwUsd: entry.snapshotKrwUsd,
          snapshotUs10y:  entry.snapshotUs10y,
        }}
        onSubmit={handleSubmit}
        submitLabel="수정 저장"
      />
    </div>
  );
}
