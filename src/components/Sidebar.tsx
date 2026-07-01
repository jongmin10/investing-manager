"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

type NavItem = {
  href: string; icon: string; label: string;
  children?: { href: string; icon: string; label: string }[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/",           icon: "📊", label: "대시보드" },
  { href: "/report",     icon: "📰", label: "시황 리포트" },
  { href: "/portfolio",  icon: "💼", label: "투자전략 플래너" },
  { href: "/tracker",    icon: "📈", label: "수익률 트래커" },
  { href: "/returns",    icon: "📉", label: "지수 수익률" },
  { href: "/exports",    icon: "🚢", label: "품목별 수출" },
  { href: "/calculator", icon: "🧮", label: "연금 계산기" },
  { href: "/journal",    icon: "📔", label: "투자 일기" },
  { href: "/gurus",      icon: "🏆", label: "투자 대가 13F" },
  { href: "/screener",   icon: "🔍", label: "종목 스크리너",
    children: [
      { href: "/screener/watchlist", icon: "★",  label: "관심종목" },
      { href: "/screener/lynch",     icon: "🐢", label: "피터 린치 분석" },
    ],
  },
  { href: "/glossary",   icon: "📖", label: "용어사전" },
  { href: "/calendar",   icon: "📅", label: "경제 캘린더" },
  { href: "/alerts",     icon: "🔔", label: "알림 설정" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-blue-50 flex flex-col z-20 border-r border-blue-100">
      {/* 로고 */}
      <div className="px-5 pt-6 pb-5 border-b border-blue-100">
        <Link href="/" className="block group">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="1.5" fill="white"/>
                <polygon points="12,3.5 10.5,12 12,10.5 13.5,12" fill="#fca5a5"/>
                <polygon points="12,10.5 10.5,12 12,20.5 13.5,12" fill="white" opacity="0.7"/>
                <line x1="12" y1="3" x2="12" y2="4.5" stroke="white" strokeWidth="1.2"/>
                <line x1="12" y1="19.5" x2="12" y2="21" stroke="white" strokeWidth="1.2"/>
                <line x1="3" y1="12" x2="4.5" y2="12" stroke="white" strokeWidth="1.2"/>
                <line x1="19.5" y1="12" x2="21" y2="12" stroke="white" strokeWidth="1.2"/>
              </svg>
            </div>
            <div>
              <p className="text-blue-900 font-bold text-sm leading-tight">연금</p>
              <p className="text-blue-500 font-bold text-sm leading-tight">나침반</p>
            </div>
          </div>
          <p className="text-blue-400 text-[11px] mt-2 leading-snug">DC/IRP 퇴직연금 관리 서비스</p>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon, label, children }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href;
          const isParentActive = children ? pathname.startsWith(href) : false;
          return (
            <div key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive || (isParentActive && !children?.some(c => pathname === c.href))
                    ? "bg-blue-500 text-white font-semibold shadow-sm"
                    : "text-blue-900 hover:bg-blue-100 hover:text-blue-700"
                }`}
              >
                <span className="text-base leading-none">{icon}</span>
                <span className="flex-1 truncate">{label}</span>
                {(isActive || isParentActive) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                )}
              </Link>
              {children && isParentActive && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {children.map((child) => {
                    const isChildActive = pathname === child.href;
                    return (
                      <Link key={child.href} href={child.href}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-150 ${
                          isChildActive
                            ? "bg-amber-400 text-white font-semibold shadow-sm"
                            : "text-blue-700 hover:bg-blue-100"
                        }`}>
                        <span className="text-sm leading-none">{child.icon}</span>
                        <span className="flex-1 truncate">{child.label}</span>
                        {isChildActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 관리자 섹션 — isAdmin 인 경우에만 표시 */}
      {session?.user?.isAdmin && (
        <div className="px-3 pb-2">
          <p className="text-[10px] font-semibold text-blue-400/70 uppercase tracking-widest px-3 mb-1">관리자</p>
          <Link
            href="/admin/api-status"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
              pathname === "/admin/api-status"
                ? "bg-blue-500 text-white font-semibold shadow-sm"
                : "text-blue-900 hover:bg-blue-100 hover:text-blue-700"
            }`}
          >
            <span className="text-base leading-none">⚙️</span>
            <span className="flex-1 truncate">API 상태</span>
            {pathname === "/admin/api-status" && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
            )}
          </Link>
          <Link
            href="/admin/users"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
              pathname === "/admin/users"
                ? "bg-blue-500 text-white font-semibold shadow-sm"
                : "text-blue-900 hover:bg-blue-100 hover:text-blue-700"
            }`}
          >
            <span className="text-base leading-none">👥</span>
            <span className="flex-1 truncate">사용자 목록</span>
            {pathname === "/admin/users" && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
            )}
          </Link>
        </div>
      )}

      {/* 하단 유저 영역 */}
      <div className="px-4 py-4 border-t border-blue-100">
        {status === "loading" ? (
          <div className="h-8 bg-blue-100 rounded-lg animate-pulse" />
        ) : session?.user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {(session.user.name ?? session.user.email ?? "U")[0].toUpperCase()}
              </div>
              <span className="text-xs text-blue-800 truncate flex-1">
                {session.user.name ?? session.user.email}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full text-xs text-blue-400 hover:text-blue-600 py-1.5 transition-colors text-left px-2"
            >
              로그아웃 →
            </button>
          </div>
        ) : (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
            className="flex items-center justify-center w-full py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            로그인
          </Link>
        )}
      </div>
    </aside>
  );
}
