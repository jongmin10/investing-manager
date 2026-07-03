/**
 * 비밀번호 해싱 유틸 (규격: docs/signup-auth-spec.md §4).
 *
 * bcryptjs(순수 JS) 사용 — 네이티브 `bcrypt`는 Vercel 서버리스 빌드/런타임에서
 * 바인딩 이슈 가능성이 있어 회피. cost 팩터 10(응답시간·보안 균형).
 * 비밀번호는 평문 저장 금지 — 항상 이 헬퍼로 해시/검증한다.
 */

import bcrypt from "bcryptjs";

const COST = 10;

/** 비밀번호 정책(확정): 최소 8자, 최대 72바이트(bcrypt 한계), 공백만 구성 금지. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** 비밀번호 정책 검증 — 통과 시 null, 실패 시 사유 문자열 반환. */
export function validatePassword(plain: string): string | null {
  if (typeof plain !== "string") return "비밀번호를 입력해주세요.";
  if (plain.trim().length === 0) return "비밀번호를 입력해주세요.";
  if (plain.length < PASSWORD_MIN_LENGTH) return `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  // bcrypt는 72바이트 초과분을 잘라내므로, 사용자 오해 방지를 위해 명시적으로 거부.
  if (Buffer.byteLength(plain, "utf8") > PASSWORD_MAX_LENGTH) {
    return `비밀번호가 너무 깁니다(최대 ${PASSWORD_MAX_LENGTH}바이트).`;
  }
  return null;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
