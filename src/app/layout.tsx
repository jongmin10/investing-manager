import type { Metadata, Viewport } from "next";
import "./globals.css";
import Disclaimer from "@/components/Disclaimer";
import SessionProvider from "@/components/SessionProvider";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export const metadata: Metadata = {
  metadataBase: new URL("https://investing-manager-kf7m.vercel.app"),
  title: "연금 나침반",
  description: "DC/IRP 퇴직연금 관리를 위한 경제지표·종목 스크리너·투자 대가 포트폴리오 서비스",
  applicationName: "연금 나침반",
  // iOS "홈 화면에 추가" 시 앱 이름·standalone 표시
  appleWebApp: { capable: true, title: "연금 나침반", statusBarStyle: "default" },
};

// themeColor는 Next.js 14+ 에서 viewport export로 분리됨 (브라우저 주소창·PWA 스플래시 색)
export const viewport: Viewport = {
  themeColor: "#3b82f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>
          {/* 데스크톱 사이드바 */}
          <div className="hidden md:block">
            <Sidebar />
          </div>

          {/* 모바일 하단 탭 */}
          <MobileNav />

          {/* 메인 콘텐츠 — 사이드바 너비만큼 오른쪽으로 */}
          {/* 모바일 고정 하단 네비 높이만큼 하단 여백 확보(경고문 잘림 방지) */}
          <div className="md:ml-56 pb-24 md:pb-0">
            <main className="max-w-5xl mx-auto px-4 py-6">
              {children}
            </main>
            <footer className="max-w-5xl mx-auto px-4 pb-6">
              <Disclaimer />
            </footer>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
