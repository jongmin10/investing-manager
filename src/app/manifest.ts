import type { MetadataRoute } from "next";

// Web App Manifest — Android/Chrome "홈 화면에 추가"·PWA 설치 시 사용.
// Next.js가 <link rel="manifest"> 를 자동 삽입한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "연금 나침반",
    short_name: "연금나침반",
    description:
      "DC/IRP 퇴직연금 관리를 위한 경제지표·종목 스크리너·투자 대가 포트폴리오 서비스",
    start_url: "/",
    display: "standalone",
    background_color: "#eff6ff",
    theme_color: "#3b82f6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
