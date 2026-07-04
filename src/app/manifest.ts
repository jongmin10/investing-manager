import type { MetadataRoute } from "next";

// Web App Manifest — Android/Chrome "홈 화면에 추가"·PWA 설치 시 사용.
// Next.js가 <link rel="manifest"> 를 자동 삽입한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "연금 나침반",
    short_name: "연금나침반",
    description:
      "DC/IRP 퇴직연금 관리를 위한 경제지표·종목 스크리너·투자 대가 포트폴리오 서비스",
    start_url: "/",
    display: "standalone",
    background_color: "#eff6ff",
    theme_color: "#3b82f6",
    // PNG 전용: 데스크톱 "바로가기 만들기"/PWA 설치 아이콘은 래스터를 사용하므로
    // SVG를 manifest에서 제외해 SVG-우선 fallback(옛 아이콘 표시) 여지를 없앤다.
    // (SVG 파비콘은 app/icon.svg 규칙으로 <link rel="icon">에 별도 제공됨 — 탭용)
    icons: [
      // any: 데스크톱 설치/바로가기 — 마스킹 없이 정사각형 그대로 노출(나침반 꽉 참)
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable: 모바일 홈 화면 adaptive 마스킹 — 안전 영역 유지
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
