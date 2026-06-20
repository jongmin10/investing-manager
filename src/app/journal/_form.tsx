"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MOODS, DECISION_TYPES } from "@/lib/journal-constants";

interface Snapshot { kospi: number | null; sp500: number | null; krwUsd: number | null; us10y: number | null; }

interface FormValues {
  date: string; title: string; body: string;
  mood: string; decisionType: string; tickers: string[];
  snapshotKospi?: number | null; snapshotSp500?: number | null;
  snapshotKrwUsd?: number | null; snapshotUs10y?: number | null;
}

interface Props {
  initial?: Partial<FormValues>;
  onSubmit: (values: FormValues) => Promise<void>;
  submitLabel?: string;
}

export default function JournalForm({ initial, onSubmit, submitLabel = "저장" }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [date,         setDate]         = useState(initial?.date ?? today);
  const [title,        setTitle]        = useState(initial?.title ?? "");
  const [body,         setBody]         = useState(initial?.body ?? "");
  const [mood,         setMood]         = useState(initial?.mood ?? "");
  const [decisionType, setDecisionType] = useState(initial?.decisionType ?? "");
  const [tickers,      setTickers]      = useState<string[]>(initial?.tickers ?? []);
  const [tickerInput,  setTickerInput]  = useState("");
  const [snapshot,     setSnapshot]     = useState<Snapshot | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");

  // 신규 작성 시 스냅샷 자동 로드
  useEffect(() => {
    if (initial?.snapshotKospi != null) {
      setSnapshot({ kospi: initial.snapshotKospi ?? null, sp500: initial.snapshotSp500 ?? null,
                    krwUsd: initial.snapshotKrwUsd ?? null, us10y: initial.snapshotUs10y ?? null });
      return;
    }
    fetch("/api/journal/snapshot")
      .then((r) => r.json())
      .then((d) => setSnapshot(d))
      .catch(() => {});
  }, []);

  function addTicker() {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers((prev) => [...prev, t]);
    setTickerInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("제목을 입력해주세요."); return; }
    setSaving(true); setError("");
    try {
      await onSubmit({
        date, title, body, mood, decisionType, tickers,
        snapshotKospi:  snapshot?.kospi,
        snapshotSp500:  snapshot?.sp500,
        snapshotKrwUsd: snapshot?.krwUsd,
        snapshotUs10y:  snapshot?.us10y,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 날짜 + 제목 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <label className="text-xs text-gray-400 mb-1 block">날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">제목 *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="오늘의 투자 결정이나 생각을 한 줄로..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        </div>
      </div>

      {/* 감정 + 결정 유형 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-xs text-gray-400 mb-2">지금 기분</p>
          <div className="flex gap-2 flex-wrap">
            {MOODS.map((m) => (
              <button key={m.key} type="button" onClick={() => setMood(mood === m.key ? "" : m.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                  mood === m.key ? m.color + " border-current" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}>
                <span className="text-lg">{m.emoji}</span>{m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">결정 유형</p>
          <div className="flex gap-2 flex-wrap">
            {DECISION_TYPES.map((d) => (
              <button key={d.key} type="button" onClick={() => setDecisionType(decisionType === d.key ? "" : d.key)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  decisionType === d.key ? d.color + " border-transparent" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* 종목 태그 */}
        <div>
          <p className="text-xs text-gray-400 mb-2">관련 종목</p>
          <div className="flex gap-2 flex-wrap mb-2">
            {tickers.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs font-mono bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                {t}
                <button type="button" onClick={() => setTickers((prev) => prev.filter((x) => x !== t))}
                  className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } }}
              placeholder="AAPL, OXY... Enter로 추가"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button type="button" onClick={addTicker}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-gray-600 transition-colors">
              추가
            </button>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <label className="text-xs text-gray-400 mb-2 block">내용</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10}
          placeholder="오늘의 투자 근거, 시장 분석, 감정 상태 등 자유롭게 기록하세요..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none leading-relaxed" />
      </div>

      {/* 시장 스냅샷 */}
      {snapshot && (snapshot.kospi || snapshot.sp500 || snapshot.krwUsd || snapshot.us10y) && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-blue-600 mb-2">📌 작성 시점 시장 스냅샷 (자동)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {snapshot.kospi  && <div><span className="text-gray-400">KOSPI</span>  <span className="font-semibold ml-1">{snapshot.kospi.toLocaleString()}</span></div>}
            {snapshot.sp500  && <div><span className="text-gray-400">S&P500</span> <span className="font-semibold ml-1">{snapshot.sp500.toLocaleString()}</span></div>}
            {snapshot.krwUsd && <div><span className="text-gray-400">환율</span>   <span className="font-semibold ml-1">{snapshot.krwUsd.toLocaleString()}원</span></div>}
            {snapshot.us10y  && <div><span className="text-gray-400">미국채10Y</span><span className="font-semibold ml-1">{snapshot.us10y.toFixed(2)}%</span></div>}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving}
          className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
          {saving ? "저장 중..." : submitLabel}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium rounded-xl transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
