"use client";

import { useState } from "react";

// ── 타입 (날짜는 ISO 문자열로 직렬화 후 전달) ───────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string; // ISO — 첫 로그인 시각
  lastLoginAt: string | null; // ISO — 마지막 로그인 시각 (미갱신 시 null)
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
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [refreshing, setRefreshing] = useState(false);

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
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-all">{u.email}</p>
                    <p className="text-[10px] text-gray-400 font-mono break-all">{u.id}</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>첫 로그인</span>
                    <span className="font-mono text-gray-700">{fmtDateTime(u.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>마지막 로그인</span>
                    <span className="font-mono text-gray-700">{fmtDateTime(u.lastLoginAt)}</span>
                  </div>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-gray-900 break-all">{u.email}</p>
                          <p className="text-[10px] text-gray-400 font-mono break-all">{u.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {fmtDateTime(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {fmtDateTime(u.lastLoginAt)}
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
