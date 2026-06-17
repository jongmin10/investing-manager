"use client";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="w-16 h-6 bg-gray-200 animate-pulse rounded" />;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 hidden sm:block">
          {session.user.name ?? session.user.email}
        </span>
        <Link
          href="/portfolio"
          className="text-sm text-blue-600 font-medium hover:text-blue-700"
        >
          내 포트폴리오
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="text-sm bg-blue-500 text-white px-4 py-1.5 rounded-full hover:bg-blue-600 transition-colors font-medium"
    >
      로그인
    </Link>
  );
}
