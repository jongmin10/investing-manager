/**
 * 관리자 권한 게이팅 유틸.
 *
 * 권한 모델(규격 §3): DB 역할 컬럼 없이 환경변수 `ADMIN_EMAILS`(콤마 구분 이메일
 * 화이트리스트)로만 게이팅한다. cron-self.ts 의 isAuthorizedCron 과 동일한 "라우트
 * 가드" 패턴 — 라우트 핸들러 진입부에서 한 줄로 검사하고, 미충족 시 404(존재 은닉).
 */

/** ADMIN_EMAILS 화이트리스트에 포함된 이메일인지 검사한다(대소문자·공백 무시). */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
