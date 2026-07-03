/**
 * 초대(Invitation) 유틸 (규격: docs/signup-auth-spec.md §3·§5).
 *
 * 초대제 가입: DB에 없는 이메일은 유효한 초대 토큰이 있어야 가입 가능.
 * 토큰은 추측 불가한 32바이트 난수(base64url). 1회용(usedAt 소진).
 */

import { randomBytes } from "crypto";

/** 기본 만료: 7일. */
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;

/** 추측 불가한 초대 토큰 생성(32바이트 → base64url, ~43자). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 초대의 현재 상태 판정(목록 표시·검증 공용). */
export type InviteState = "active" | "used" | "expired";

export function inviteState(inv: { usedAt: Date | null; expiresAt: Date | null }, now: Date = new Date()): InviteState {
  if (inv.usedAt) return "used";
  if (inv.expiresAt && inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
