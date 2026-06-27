"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/portfolio";

  const [email,    setEmail]    = useState("");
  const [name,     setName]     = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", { email, name, password, redirect: false });
      if (res?.error) {
        setError("로그인에 실패했습니다. 다시 시도해주세요.");
        setLoading(false);
      } else if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError("알 수 없는 오류가 발생했습니다.");
        setLoading(false);
      }
    } catch (err) {
      console.error("로그인 오류:", err);
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com" required
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이름 <span className="text-gray-400 font-normal">(선택 · 첫 가입 시)</span>
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="홍길동"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호 <span className="text-gray-400 font-normal">(운영 환경)</span>
        </label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="공유 비밀번호" autoComplete="current-password"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={loading || !email}
        className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? "로그인 중..." : "이메일로 계속하기"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">로그인</h1>
          <p className="text-sm text-gray-500">
            투자 성향 분석 및 포트폴리오 제안을 이용하려면 로그인이 필요합니다.
          </p>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse bg-gray-50 rounded-xl" />}>
          <LoginForm />
        </Suspense>
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← 대시보드로 돌아가기
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400 text-center">
          로그인 시 개인정보 처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}
