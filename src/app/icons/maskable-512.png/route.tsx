import { compassAppIcon } from "../../_brand/compass";

// PWA manifest 아이콘 512×512 PNG (purpose: maskable — 모바일 홈 화면 adaptive 마스킹용,
// 나침반을 안전 영역 안에 배치).
export function GET() {
  return compassAppIcon(512, 0.62);
}
