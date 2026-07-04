import { compassAppIcon } from "./_brand/compass";

// iOS "홈 화면에 추가" 아이콘 (180×180 PNG). Next.js가 <link rel="apple-touch-icon"> 자동 삽입.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return compassAppIcon(180);
}
