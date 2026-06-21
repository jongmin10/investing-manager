"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const PRIMARY_TABS = [
  { href: "/",          icon: "📊", label: "대시보드" },
  { href: "/report",    icon: "📰", label: "리포트"   },
  { href: "/portfolio", icon: "💼", label: "포트폴리오" },
  { href: "/screener",  icon: "🔍", label: "스크리너"  },
];

const MORE_ITEMS = [
  { href: "/tracker",            icon: "📈", label: "수익률 트래커" },
  { href: "/calculator",         icon: "🧮", label: "복리 계산기"  },
  { href: "/journal",            icon: "📔", label: "투자 일기"    },
  { href: "/gurus",              icon: "🏆", label: "대가 13F"     },
  { href: "/screener/watchlist", icon: "★",  label: "관심종목"     },
  { href: "/glossary",           icon: "📖", label: "용어사전"     },
  { href: "/calendar",           icon: "📅", label: "경제 캘린더"  },
  { href: "/alerts",             icon: "🔔", label: "알림 설정"    },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_ITEMS.some(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)
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
              {MORE_ITEMS.map(({ href, icon, label }) => {
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
