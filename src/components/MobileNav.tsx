"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

const PRIMARY_TABS = [
  { href: "/",          icon: "📊", label: "대시보드" },
  { href: "/report",    icon: "📰", label: "리포트"   },
  { href: "/portfolio", icon: "💼", label: "포트폴리오" },
  { href: "/screener",  icon: "🔍", label: "스크리너"  },
];

const MORE_ITEMS = [
  { href: "/tracker",            icon: "📈", label: "수익률 트래커" },
  { href: "/returns",            icon: "📉", label: "지수 수익률"   },
  { href: "/exports",            icon: "🚢", label: "품목별 수출"   },
  { href: "/calculator",         icon: "🧮", label: "연금 계산기"  },
  { href: "/journal",            icon: "📔", label: "투자 일기"    },
  { href: "/gurus",              icon: "🏆", label: "대가 13F"     },
  { href: "/screener/watchlist", icon: "★",  label: "관심종목"     },
  { href: "/screener/lynch",     icon: "🐢", label: "피터 린치 분석" },
  { href: "/glossary",           icon: "📖", label: "용어사전"     },
  { href: "/calendar",           icon: "📅", label: "경제 캘린더"  },
  { href: "/alerts",             icon: "🔔", label: "알림 설정"    },
];

// 관리자 항목 — isAdmin 에게만, 기본 접힘(톱니 클릭 시 노출)
// (초대 관리: 현재 개방 가입이라 미사용 → 메뉴 숨김. 페이지·API는 유지.)
const ADMIN_ITEMS = [
  { href: "/admin/api-status", icon: "🖥️", label: "API 상태" },
  { href: "/admin/users", icon: "👥", label: "사용자 목록" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // 관리자 메뉴 기본 접힘 — 톱니 클릭 시 펼침(세션 한정)
  const [showAdmin, setShowAdmin] = useState(false);
  const { data: session, status } = useSession();

  const isAdmin = !!session?.user?.isAdmin;
  // 그리드에 실제 표시할 항목: 관리자가 톱니를 눌러 펼친 경우에만 관리자 항목 포함
  const visibleMoreItems = [
    ...MORE_ITEMS,
    ...(isAdmin && showAdmin ? ADMIN_ITEMS : []),
  ];

  // "더보기" 탭 활성 판정은 관리자 경로도 항상 포함(접혀 있어도 현재 위치 반영)
  const isMoreActive = [...MORE_ITEMS, ...(isAdmin ? ADMIN_ITEMS : [])].some(
    ({ href }) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  );

  return (
    <>
      {/* 더보기 오버레이 */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-30 flex flex-col-reverse md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="bg-slate-900 border-t border-slate-700/50 pb-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 p-3 gap-2">
              {visibleMoreItems.map(({ href, icon, label }) => {
                const isActive =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-[11px] font-medium transition-colors ${
                      isActive
                        ? "text-blue-400 bg-slate-800"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-xl leading-none">{icon}</span>
                    <span className="text-center leading-tight">{label}</span>
                  </Link>
                );
              })}

              {/* 관리자 톱니 토글 — isAdmin 에게만. 클릭 시 관리자 항목 펼침/접힘 */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdmin((v) => !v)}
                  aria-expanded={showAdmin}
                  aria-label="관리자 메뉴"
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl text-[11px] font-medium transition-colors ${
                    showAdmin
                      ? "text-blue-400 bg-slate-800"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <span className="text-xl leading-none">⚙️</span>
                  <span className="text-center leading-tight">관리자</span>
                </button>
              )}
            </div>

            {/* 사용자 영역 — 로그아웃/로그인 (모바일에선 사이드바가 숨겨지므로 여기서 제공) */}
            <div className="px-3 pb-3 pt-1 border-t border-slate-700/50">
              {status === "loading" ? (
                <div className="h-10 bg-slate-800 rounded-xl animate-pulse" />
              ) : session?.user ? (
                <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(session.user.name ?? session.user.email ?? "U")[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-300 truncate flex-1">
                    {session.user.name ?? session.user.email}
                  </span>
                  <button
                    onClick={() => { setMoreOpen(false); signOut({ callbackUrl: "/" }); }}
                    className="text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors flex-shrink-0"
                  >
                    로그아웃
                  </button>
                </div>
              ) : (
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center justify-center w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  로그인
                </Link>
              )}
            </div>
          </div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      {/* 하단 탭 바 */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex md:hidden bg-slate-900 border-t border-slate-700/50">
        {PRIMARY_TABS.map(({ href, icon, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-400 rounded-full" />
              )}
              <span className="text-[18px] leading-none">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}

        {/* 더보기 버튼 */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
            moreOpen || isMoreActive ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {(moreOpen || isMoreActive) && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-400 rounded-full" />
          )}
          <span className="text-[18px] leading-none">⋯</span>
          <span>더보기</span>
        </button>
      </nav>
    </>
  );
}
