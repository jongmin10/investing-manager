import { compassAppIcon } from "../../_brand/compass";

// Android/PWA manifest 아이콘 (192×192 PNG). manifest.ts 에서 참조.
export function GET() {
  return compassAppIcon(192);
}
