"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const NAV_ITEMS = [
  { href: "/",          icon: "📊", label: "대시보드" },
  { href: "/portfolio", icon: "💼", label: "포트폴리오" },
  { href: "/tracker",   icon: "📈", label: "수익률 트래커" },
  { href: "/glossary",  icon: "📖", label: "용어사전" },
  { href: "/calendar",  icon: "📅", label: "경제 캘린더" },
  { href: "/alerts",    icon: "🔔", label: "알림 설정" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-slate-900 flex flex-col z-20 border-r border-slate-700/40">
      {/* 로고 */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-700/50">
        <Link href="/" className="block group">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              R
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">퇴직연금</p>
              <p className="text-blue-400 font-bold text-sm leading-tight">대시보드</p>
            </div>
          </div>
          <p className="text-slate-500 text-[11px] mt-2 leading-snug">DC/IRP 경제지표 모니터</p>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? "bg-blue-500/20 text-blue-300 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="flex-1 truncate">{label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* 하단 유저 영역 */}
      <div className="px-4 py-4 border-t border-slate-700/50">
        {status === "loading" ? (
          <div className="h-8 bg-slate-800 rounded-lg animate-pulse" />
        ) : session?.user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {(session.user.name ?? session.user.email ?? "U")[0].toUpperCase()}
              </div>
              <span className="text-xs text-slate-300 truncate flex-1">
                {session.user.name ?? session.user.email}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full text-xs text-slate-500 hover:text-slate-300 py-1.5 transition-colors text-left px-2"
            >
              로그아웃 →
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center w-full py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition-colors"
          >
            로그인
          </Link>
        )}
      </div>
    </aside>
  );
}
