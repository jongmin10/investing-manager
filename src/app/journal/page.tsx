"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { getMood, getDecisionType } from "@/lib/journal-constants";

interface EntryItem {
  id: string; date: string; title: string;
  mood: string | null; decisionType: string | null; tickers: string | null;
}

function fmtDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function parseTickers(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

const PAGE_SIZE = 20;

export default function JournalPage() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/journal")
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries ?? []); setLoading(false); });
  }, [status]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="로딩 중"
        />
      </div>
    );
  }

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const pageEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalCount = entries.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 py-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📔 투자 일기</h1>
          <p className="text-sm text-gray-400 mt-0.5">나의 투자 기록과 당시 생각을 남겨두세요</p>
        </div>
        <Link
          href="/journal/new"
          className="shrink-0 whitespace-nowrap px-4 py-2 bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 text-white text-sm font-medium rounded-xl transition-colors"
        >
          + 새 일기
        </Link>
      </div>

      {/* 로딩 스켈레톤 */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="일기 목록 로딩 중">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        /* 빈 상태 */
        <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center">
          <p className="text-4xl mb-3" aria-hidden="true">📔</p>
          <p className="text-gray-500 font-medium">아직 작성된 일기가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">첫 번째 투자 일기를 작성해보세요</p>
          <Link
            href="/journal/new"
            className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors"
          >
            일기 작성하기
          </Link>
        </div>
      ) : (
        <>
          {/* ─── 게시판 테이블 (전 뷰포트 공통) ───
              모바일에서는 보조 컬럼(번호·종목)을 숨기고 여백을 좁혀
              가로 스크롤 없이 데스크톱과 동일한 테이블 형식을 유지한다. */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full table-fixed text-sm" aria-label="투자 일기 목록">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th
                    scope="col"
                    className="hidden md:table-cell w-12 px-4 py-3 text-center text-xs font-semibold text-gray-500 tracking-wide"
                  >
                    번호
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 md:px-4 md:py-3 text-left text-xs font-semibold text-gray-500 tracking-wide"
                  >
                    제목
                  </th>
                  <th
                    scope="col"
                    className="w-[68px] md:w-24 px-2 py-2.5 md:px-4 md:py-3 text-left text-xs font-semibold text-gray-500 tracking-wide"
                  >
                    결정
                  </th>
                  <th
                    scope="col"
                    className="hidden md:table-cell w-36 px-4 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide"
                  >
                    종목
                  </th>
                  <th
                    scope="col"
                    className="w-[88px] md:w-32 px-3 py-2.5 md:px-4 md:py-3 text-right text-xs font-semibold text-gray-500 tracking-wide"
                  >
                    날짜
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageEntries.map((e, idx) => {
                  const rowNum = totalCount - (page - 1) * PAGE_SIZE - idx;
                  const mood = getMood(e.mood);
                  const dt = getDecisionType(e.decisionType);
                  const tickers = parseTickers(e.tickers);
                  const visibleTickers = tickers.slice(0, 2);
                  const extraCount = tickers.length - visibleTickers.length;

                  return (
                    <tr
                      key={e.id}
                      onClick={() => router.push(`/journal/${e.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="hidden md:table-cell px-4 py-3 text-center text-gray-400 text-xs tabular-nums">
                        {rowNum}
                      </td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 max-w-0">
                        <Link
                          href={`/journal/${e.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 focus:outline-none focus:text-blue-600 focus:underline truncate block"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {mood ? (
                            <span aria-label={mood.label} className="mr-1">{mood.emoji}</span>
                          ) : null}
                          {e.title}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 md:px-4 md:py-3 whitespace-nowrap">
                        {dt && (
                          <span
                            className={`inline-flex items-center text-[11px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded-full ${dt.color}`}
                          >
                            {dt.label}
                          </span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {visibleTickers.map((t) => (
                            <span
                              key={t}
                              className="text-[11px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                            >
                              {t}
                            </span>
                          ))}
                          {extraCount > 0 && (
                            <span className="text-[11px] text-gray-400 self-center">
                              +{extraCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-right text-gray-400 text-[11px] md:text-xs whitespace-nowrap tabular-nums">
                        {fmtDate(e.date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 (2페이지 이상일 때만) */}
          {totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-1.5 pt-2"
              aria-label="페이지 네비게이션"
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 transition-colors"
                aria-label="이전 페이지"
              >
                &#8249;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={`w-8 h-8 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 transition-colors ${
                    p === page
                      ? "bg-blue-500 text-white font-semibold"
                      : "text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 transition-colors"
                aria-label="다음 페이지"
              >
                &#8250;
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
