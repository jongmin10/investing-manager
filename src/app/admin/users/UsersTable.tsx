"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

// ── 타입 (날짜는 ISO 문자열로 직렬화 후 전달) ───────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string; // ISO — 첫 로그인 시각
  lastLoginAt: string | null; // ISO — 마지막 로그인 시각 (미갱신 시 null)
  loginCount: number; // 누적 로그인 횟수 (기본 0)
  blockedAt: string | null; // ISO — 로그인 차단 시각 (null = 정상)
}

interface Props {
  initialUsers: UserRow[];
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

// KST 표기 — hour12:false 로 서버/클라이언트 오전·오후 표기 차이로 인한
// 하이드레이션 불일치 방지 (api-status 페이지와 동일 규약).
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function UsersTable({ initialUsers }: Props) {
  const { data: session } = useSession();
  const myEmail = session?.user?.email?.toLowerCase() ?? null;

  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = (await res.json()) as { users: UserRow[] };
        setUsers(data.users);
      }
    } catch {
      // silent — 조회 실패는 화면 유지
    } finally {
      setRefreshing(false);
    }
  }

  // 로그인 차단/해제 토글.
  async function handleToggleBlock(u: UserRow) {
    const nextBlocked = !u.blockedAt;
    if (nextBlocked && !confirm(`${u.email} 계정의 로그인을 차단할까요?`)) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      if (res.ok) {
        const data = (await res.json()) as { blockedAt: string | null };
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, blockedAt: data.blockedAt } : x)));
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        alert(d.error ?? "처리에 실패했습니다.");
      }
    } catch {
      alert("서버 연결에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // 사용자 삭제(연관 데이터 함께 삭제). 되돌릴 수 없음 → 2단계 확인.
  async function handleDelete(u: UserRow) {
    if (!confirm(`${u.email} 계정을 삭제할까요?\n연관된 모든 데이터(성향진단·포트폴리오·일기 등)가 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        alert(d.error ?? "삭제에 실패했습니다.");
      }
    } catch {
      alert("서버 연결에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // 본인 계정에는 액션 숨김(관리자 계정 보호는 서버 가드가 추가로 담당).
  const canAct = (u: UserRow) => myEmail !== null && u.email.toLowerCase() !== myEmail;

  const blockedBadge = (u: UserRow) =>
    u.blockedAt ? (
      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-red-50 text-red-500 border-red-200 whitespace-nowrap">
        차단됨
      </span>
    ) : null;

  function rowActions(u: UserRow) {
    if (!canAct(u)) return <span className="text-[11px] text-gray-300">—</span>;
    const blocked = !!u.blockedAt;
    const busy = busyId === u.id;
    return (
      <div className="flex items-center gap-1.5 justify-end">
        <button
          onClick={() => handleToggleBlock(u)}
          disabled={busy}
          className={`text-xs rounded-lg px-2.5 py-1 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            blocked
              ? "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              : "text-amber-600 border-amber-200 hover:bg-amber-50"
          }`}
        >
          {blocked ? "차단해제" : "차단"}
        </button>
        <button
          onClick={() => handleDelete(u)}
          disabled={busy}
          className="text-xs rounded-lg px-2.5 py-1 border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          삭제
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">사용자 목록</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            로그인한 사용자 · 첫 로그인 / 마지막 로그인 시각 (KST)
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
          className="px-4 py-2 border border-gray-200 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? "새로고침 중..." : "새로고침"}
        </button>
      </div>

      <section aria-labelledby="users-heading">
        <h2
          id="users-heading"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
        >
          전체 {users.length}명
        </h2>

        {users.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-400 text-sm">아직 로그인한 사용자가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {/* 모바일: 카드형 목록 */}
            <ul className="sm:hidden divide-y divide-gray-100">
              {users.map((u) => (
                <li key={u.id} className="p-4 space-y-1.5">
                  <div className="min-w-0 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 break-all">{u.email}</p>
                      <p className="text-[10px] text-gray-400 font-mono break-all">{u.id}</p>
                    </div>
                    {blockedBadge(u)}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>첫 로그인</span>
                    <span className="font-mono text-gray-700">{fmtDateTime(u.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>마지막 로그인</span>
                    <span className="font-mono text-gray-700">{fmtDateTime(u.lastLoginAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>로그인 횟수</span>
                    <span className="font-mono text-gray-700">{u.loginCount.toLocaleString("ko-KR")}</span>
                  </div>
                  {canAct(u) && <div className="pt-1.5">{rowActions(u)}</div>}
                </li>
              ))}
            </ul>

            {/* 데스크탑: 테이블형 — 사용자 아이디 · 첫 로그인 · 마지막 로그인 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      사용자 아이디
                    </th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      첫 로그인
                    </th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      마지막 로그인
                    </th>
                    <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      로그인 횟수
                    </th>
                    <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-gray-900 break-all">{u.email}</p>
                            {blockedBadge(u)}
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono break-all">{u.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {fmtDateTime(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {fmtDateTime(u.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap font-mono text-xs">
                        {u.loginCount.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {rowActions(u)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
