"use client";

import { useState, useTransition } from "react";
import type { TriggerType } from "@/lib/collection-registry";

export interface CollectionRow {
  id: string;
  name: string;
  url: string;
  schedule: string;
  trigger: TriggerType;
  description: string;
  lastRun: {
    status: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    itemsOk: number;
    itemsFailed: number;
    error: string | null;
  } | null;
}

interface Props {
  initialRows: CollectionRow[];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    success: { bg: "bg-emerald-100", text: "text-emerald-700", label: "성공" },
    partial: { bg: "bg-amber-100",   text: "text-amber-700",   label: "부분" },
    failed:  { bg: "bg-red-100",     text: "text-red-700",     label: "실패" },
  };
  const c = cfg[status] ?? { bg: "bg-gray-100", text: "text-gray-500", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: TriggerType }) {
  if (trigger === "cron")
    return <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-mono">cron</span>;
  if (trigger === "chain")
    return <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-mono">chain</span>;
  return <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">manual</span>;
}

export default function CollectionsPanel({ initialRows }: Props) {
  const [rows, setRows] = useState<CollectionRow[]>(initialRows);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  async function refresh() {
    const res = await fetch("/api/admin/collections");
    if (res.ok) setRows(await res.json());
  }

  async function trigger(row: CollectionRow) {
    if (!row.url) return;
    setTriggeringId(row.id);
    try {
      const res = await fetch(row.url, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const ok = json.itemsOk ?? json.ok ?? "?";
        setToast({ msg: `${row.name}: ${typeof ok === "number" ? ok + "건 수집" : "완료"}`, ok: true });
      } else {
        setToast({ msg: `${row.name}: 오류 (${res.status})`, ok: false });
      }
    } catch (e) {
      setToast({ msg: `${row.name}: 네트워크 오류`, ok: false });
    } finally {
      setTriggeringId(null);
      startTransition(() => { refresh(); });
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">수집 현황</h1>
          <p className="text-sm text-gray-500 mt-0.5">수집 잡 목록 및 마지막 실행 결과</p>
        </div>
        <button
          onClick={() => startTransition(() => { refresh(); })}
          className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          새로고침
        </button>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${
          toast.ok
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 font-semibold">
              <th className="text-left p-3 pl-4">이름</th>
              <th className="text-left p-3 hidden lg:table-cell">수집 URL</th>
              <th className="text-left p-3">주기</th>
              <th className="text-left p-3">마지막 실행</th>
              <th className="text-center p-3">상태</th>
              <th className="text-right p-3 hidden md:table-cell">성공/실패</th>
              <th className="text-right p-3 hidden md:table-cell">소요</th>
              <th className="text-center p-3">실행</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                {/* 이름 */}
                <td className="p-3 pl-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{row.name}</span>
                    <TriggerBadge trigger={row.trigger} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 hidden sm:block">{row.description}</p>
                </td>

                {/* URL */}
                <td className="p-3 hidden lg:table-cell">
                  {row.url ? (
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{row.url}</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>

                {/* 주기 */}
                <td className="p-3 text-xs text-gray-600 whitespace-nowrap">{row.schedule}</td>

                {/* 마지막 실행 */}
                <td className="p-3">
                  {row.lastRun ? (
                    <span
                      className="text-xs text-gray-600"
                      title={new Date(row.lastRun.startedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    >
                      {relativeTime(row.lastRun.startedAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">미실행</span>
                  )}
                </td>

                {/* 상태 */}
                <td className="p-3 text-center">
                  {row.lastRun ? (
                    <span title={row.lastRun.error ?? undefined}>
                      <StatusBadge status={row.lastRun.status} />
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>

                {/* 성공/실패 */}
                <td className="p-3 text-right text-xs font-mono hidden md:table-cell">
                  {row.lastRun ? (
                    <span>
                      <span className="text-emerald-600">{row.lastRun.itemsOk}</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className={row.lastRun.itemsFailed > 0 ? "text-red-500" : "text-gray-400"}>
                        {row.lastRun.itemsFailed}
                      </span>
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* 소요시간 */}
                <td className="p-3 text-right text-xs text-gray-500 font-mono hidden md:table-cell">
                  {row.lastRun ? fmtDuration(row.lastRun.durationMs) : <span className="text-gray-300">—</span>}
                </td>

                {/* 실행 버튼 */}
                <td className="p-3 text-center">
                  {row.url && row.trigger !== "manual" ? (
                    <button
                      onClick={() => trigger(row)}
                      disabled={triggeringId === row.id}
                      className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {triggeringId === row.id ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                          실행 중
                        </span>
                      ) : "▶ 수집"}
                    </button>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        chain = 오케스트레이터(daily)가 트리거 · manual = 수동 전용 · hover 마지막 실행 시각으로 KST 절대값 확인
      </p>
    </div>
  );
}
