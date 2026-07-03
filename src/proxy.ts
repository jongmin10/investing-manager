// Next.js 16: `middleware.ts` 규약은 deprecated → `proxy.ts` 로 대체됨.
// src/ 구조이므로 app 과 같은 레벨(src/proxy.ts)에 둔다.
// (참고: node_modules/next/dist/docs/.../file-conventions/proxy.md)
//
// Edge 런타임에서 PrismaAdapter 를 쓸 수 없으므로(adapterFn 오류), 전체 auth.ts 대신
// 어댑터 없는 authConfig 로 별도 NextAuth 인스턴스를 만들어 세션(JWT) 판정에만 쓴다.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const protectedPaths = ["/survey", "/portfolio"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/survey/:path*", "/portfolio/:path*"],
};
