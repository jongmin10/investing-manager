import type { Metadata } from "next";
import "./globals.css";
import Disclaimer from "@/components/Disclaimer";
import SessionProvider from "@/components/SessionProvider";
import AuthButton from "@/components/AuthButton";
import Link from "next/link";

export const metadata: Metadata = {
  title: "퇴직연금 경제지표 대시보드",
  description: "DC/IRP 퇴직연금 관리를 위한 핵심 경제지표 모니터링 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>
          <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <div>
                <Link href="/" className="text-lg font-bold text-blue-600 hover:text-blue-700">
                  퇴직연금 대시보드
                </Link>
                <span className="text-xs text-gray-400 ml-2">DC/IRP 경제지표 모니터</span>
              </div>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/" className="text-gray-600 hover:text-blue-600 transition-colors">
                  대시보드
                </Link>
                <Link href="/glossary" className="text-gray-600 hover:text-blue-600 transition-colors">
                  용어사전
                </Link>
                <Link href="/portfolio" className="text-gray-600 hover:text-blue-600 transition-colors">
                  포트폴리오
                </Link>
                <Link href="/calendar" className="text-gray-600 hover:text-blue-600 transition-colors">
                  캘린더
                </Link>
                <Link href="/alerts" className="text-gray-600 hover:text-blue-600 transition-colors">
                  알림
                </Link>
                <Link href="/tracker" className="text-gray-600 hover:text-blue-600 transition-colors">
                  수익률
                </Link>
                <AuthButton />
              </nav>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>

          <footer className="max-w-6xl mx-auto px-4 pb-6">
            <Disclaimer />
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
