"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/",          icon: "📊", label: "대시보드" },
  { href: "/portfolio", icon: "💼", label: "포트폴리오" },
  { href: "/tracker",   icon: "📈", label: "수익률" },
  { href: "/calendar",  icon: "📅", label: "캘린더" },
  { href: "/alerts",    icon: "🔔", label: "알림" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex md:hidden bg-slate-900 border-t border-slate-700/50">
      {TABS.map(({ href, icon, label }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              isActive ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span className="text-[18px] leading-none">{icon}</span>
            <span>{label}</span>
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-400 rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
