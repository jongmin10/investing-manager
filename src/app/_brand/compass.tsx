import { ImageResponse } from "next/og";

/**
 * 브랜드 나침반 아이콘의 단일 소스.
 * 사이드바 로고(src/components/Sidebar.tsx)의 나침반과 동일한 형태이며,
 * 정적 파비콘(src/app/icon.svg)과 시각적으로 일치하도록 유지한다.
 *
 * 홈 화면(바탕화면) 바로가기 아이콘 생성에 사용:
 *  - apple-icon.tsx (iOS, 180×180 PNG)
 *  - icons/app-192.png, icons/app-512.png (Android/PWA manifest)
 */

// 흰색 나침반(투명 배경, viewBox 100). <img> 로 임베드해 래스터화한다.
const COMPASS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
<circle cx="50" cy="50" r="37" stroke="white" stroke-width="4"/>
<line x1="50" y1="4" x2="50" y2="13" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
<line x1="50" y1="87" x2="50" y2="96" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
<line x1="4" y1="50" x2="13" y2="50" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
<line x1="87" y1="50" x2="96" y2="50" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
<polygon points="50,16 43,50 50,44 57,50" fill="#fca5a5"/>
<polygon points="50,44 43,50 50,84 57,50" fill="white" opacity="0.72"/>
<circle cx="50" cy="50" r="5.5" fill="white"/>
</svg>`;

const COMPASS_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(COMPASS_SVG).toString("base64")}`;

// 브랜드 파란색 (Tailwind blue-500) — 사이드바 로고 타일과 동일
export const BRAND_BLUE = "#3b82f6";

/**
 * 파란 정사각형 배경 + 흰 나침반 앱 아이콘(PNG).
 * iOS·Android 홈 화면은 OS가 모서리를 둥글게 마스킹하므로 배경은 꽉 채우고(자체
 * 라운딩 없음), 나침반은 중앙 62%로 배치해 maskable 안전 영역(중앙 80%) 안에 둔다.
 */
export function compassAppIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_BLUE,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} src={COMPASS_DATA_URI} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
