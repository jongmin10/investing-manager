import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { verifyPassword } from "@/lib/password";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    // 사용자별 이메일 + 개인 비밀번호(bcrypt 해시) 로그인 (규격: docs/signup-auth-spec.md §5.3).
    // authorize 는 존재하는 계정의 비밀번호만 검증한다 — 자동 가입 없음.
    // 신규 사용자는 초대 기반 회원가입(POST /api/auth/register)으로 계정을 먼저 만든다.
    Credentials({
      name: "이메일로 계속하기",
      credentials: {
        email: { label: "이메일", type: "email", placeholder: "example@email.com" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        // 가입(register)과 동일하게 정규화(trim + 소문자)해 대소문자 불일치로 인한 로그인 실패 방지.
        const email = (credentials.email as string).trim().toLowerCase();

        const user = await prisma.user.findUnique({ where: { email } });
        // 사용자 없음 / 비밀번호 미설정(OAuth·미클레임 계정) → 로그인 거부(자동 생성 안 함).
        // 실패 사유를 구분하지 않아 사용자 열거(enumeration)를 방지한다.
        if (!user || !user.passwordHash) return null;

        const ok = await verifyPassword(credentials.password as string, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    // Google OAuth (GOOGLE_CLIENT_ID 환경변수 설정 시 활성화)
    ...(process.env.GOOGLE_CLIENT_ID
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  events: {
    // 로그인 성공 시 lastLoginAt 갱신 + loginCount 증가. 모든 프로바이더(Credentials·Google) 공통 동작.
    // 한 번의 update 로 lastLoginAt·loginCount 동시 갱신.
    // best-effort — update 실패가 로그인 자체를 막지 않도록 try/catch 로 흡수.
    async signIn({ user }) {
      try {
        const now = new Date();
        const data = { lastLoginAt: now, loginCount: { increment: 1 } };
        if (user?.id) {
          await prisma.user.update({ where: { id: user.id }, data });
        } else if (user?.email) {
          await prisma.user.update({ where: { email: user.email }, data });
        }
      } catch (e) {
        console.error("[auth.events.signIn] lastLoginAt·loginCount 갱신 실패", e);
      }
    },
  },
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
