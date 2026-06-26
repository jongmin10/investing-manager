import type { DefaultSession } from "next-auth";

/**
 * next-auth v5 세션 타입 확장.
 * Session.user 에 isAdmin 을 추가해 클라이언트 컴포넌트(Sidebar·MobileNav)에서
 * 관리자 전용 UI를 조건부 렌더링할 수 있게 한다.
 * 권한 경계(보안)는 서버사이드 isAdminEmail 재검사로만 보장한다.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}
