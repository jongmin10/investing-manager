"use client";

import { useState } from "react";

// ── 타입 (날짜는 ISO 문자열) ────────────────────────────────────────────────

export type InviteState = "active" | "used" | "expired";

export interface InviteRow {
  id: string;
  email: string | null;
  state: InviteState;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  tokenHint: string | null;
}

interface Props {
  initialInvites: InviteRow[];
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const STATE_BADGE: Record<InviteState, { label: string; cls: string }> = {
  active:  { label: "미사용", cls: "bg-green-50 text-green-600 border-green-200" },
  used:    { label: "사용됨", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  expired: { label: "만료",   cls: "bg-amber-50 text-amber-600 border-amber-200" },
};

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function InvitationsPanel({ initialInvites }: Props) {
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/invitations");
      if (res.ok) {
        const data = (await res.json()) as { invitations: InviteRow[] };
        setInvites(data.invitations);
      }
    } catch {
      /* silent */
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setLastLink(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined, expiresInDays: days }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "초대 생성에 실패했습니다.");
        return;
      }
      const data = (await res.json()) as { inviteUrl: string };
      // 절대 URL로 만들어 복사 편의 제공.
      setLastLink(`${window.location.origin}${data.inviteUrl}`);
      setEmail("");
      await refresh();
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 미지원 — 수동 복사 */
    }
  }

  async function handleRevoke(id: string) {
    try {
      const res = await fetch(`/api/admin/invitations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {
      /* silent */
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">초대 관리</h1>
        <p className="text-sm text-gray-400 mt-0.5">가입 초대 링크를 발급하고 상태를 관리합니다. (초대제 가입)</p>
      </div>

      {/* 초대 발급 폼 */}
      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">새 초대 발급</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              이메일 <span className="text-gray-400">(선택 · 지정 시 해당 이메일만 가입)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="특정 이메일 지정(비우면 임의)"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="sm:w-32">
            <label className="block text-xs font-medium text-gray-500 mb-1">유효기간(일)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="w-full sm:w-auto px-5 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {creating ? "발급 중..." : "초대 발급"}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {lastLink && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
            <p className="text-xs text-blue-600 font-medium">초대 링크 (이 화면에서만 표시 — 복사해 전달하세요)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-blue-900 bg-white border border-blue-100 rounded-lg px-2 py-1.5 break-all">
                {lastLink}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
              >
                {copied ? "복사됨 ✓" : "복사"}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* 초대 목록 */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          발급 내역 {invites.length}건
        </h2>
        {invites.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-400 text-sm">아직 발급한 초대가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm divide-y divide-gray-100">
            {invites.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATE_BADGE[inv.state].cls}`}>
                      {STATE_BADGE[inv.state].label}
                    </span>
                    <span className="text-sm text-gray-900 break-all">
                      {inv.email ?? <span className="text-gray-400">(임의 이메일)</span>}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    발급 {fmtDateTime(inv.createdAt)} · 만료 {fmtDateTime(inv.expiresAt)}
                    {inv.usedAt && ` · 사용 ${fmtDateTime(inv.usedAt)}`}
                  </p>
                </div>
                {inv.state === "active" && (
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    폐기
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
