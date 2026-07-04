import { compassAppIcon } from "../../_brand/compass";

// PWA manifest 아이콘 192×192 PNG (purpose: any — 데스크톱 설치/바로가기용, 마스킹 없이 노출).
export function GET() {
  return compassAppIcon(192, 0.78);
}
