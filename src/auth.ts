import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    // 로컬 개발: 이메일만 입력하면 로그인.
    // 프로덕션: 공유 비밀번호(AUTH_LOGIN_PASSWORD) 검사 추가 — 무인증 관리자 로그인 방지.
    Credentials({
      name: "이메일로 계속하기",
      credentials: {
        email: { label: "이메일", type: "email", placeholder: "example@email.com" },
        name: { label: "이름 (첫 로그인 시)", type: "text", placeholder: "홍길동" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        // 프로덕션 한정 공유 비밀번호 게이트 (1인 운영 도구 → 공유 비밀번호로 충분).
        // 로컬 dev(NODE_ENV !== "production")는 개발 편의를 위해 이메일만으로 로그인.
        if (process.env.NODE_ENV === "production") {
          const expected = process.env.AUTH_LOGIN_PASSWORD;
          // fail-closed: 비밀번호가 미설정이면 누구도 로그인 불가.
          if (!expected) return null;
          // 1인 도구이므로 타이밍 안전 비교 불필요 — 단순 일치 검사.
          if ((credentials.password as string) !== expected) return null;
        }

        const email = credentials.email as string;
        const name = (credentials.name as string) || email.split("@")[0];

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({ data: { email, name } });
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    // Google OAuth (GOOGLE_CLIENT_ID 환경변수 설정 시 활성화)
    ...(process.env.GOOGLE_CLIENT_ID
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // isAdmin 은 로그인 시점 ADMIN_EMAILS 기준으로 JWT 에 저장.
        // UI 표시용(사이드바 관리자 섹션)이며, 보안 경계는 서버사이드 isAdminEmail 재검사로 보장.
        (token as Record<string, unknown>)["isAdmin"] = isAdminEmail(user.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      if (session.user) {
        session.user.isAdmin = ((token as Record<string, unknown>)["isAdmin"] as boolean) ?? false;
      }
      return session;
    },
  },
});
