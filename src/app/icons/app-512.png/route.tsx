import { compassAppIcon } from "../../_brand/compass";

// Android/PWA manifest 아이콘 (512×512 PNG, any·maskable 겸용). manifest.ts 에서 참조.
export function GET() {
  return compassAppIcon(512);
}
