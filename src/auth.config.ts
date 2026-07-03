import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe 기본 인증 설정 (NextAuth v5 split-config 패턴).
 *
 * proxy.ts(구 middleware)는 Edge 런타임에서 실행되므로 PrismaAdapter·prisma·bcrypt 등
 * Node 전용 모듈을 import 하면 "adapterFn is not a function" 류 오류가 난다.
 * 따라서 어댑터·프로바이더의 무거운 로직은 여기 두지 않고, auth.ts(Node)에서 주입한다.
 * proxy 는 이 설정만으로 JWT 세션 쿠키를 해독해 로그인 여부(req.auth)를 판정한다.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [], // 실제 provider(Credentials·Google)는 auth.ts 에서 주입.
} satisfies NextAuthConfig;
