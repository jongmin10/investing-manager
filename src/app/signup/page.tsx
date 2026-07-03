"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const DEFAULT_REDIRECT = "/portfolio";
const PASSWORD_MIN_LENGTH = 8;

function SignupForm() {
  const searchParams = useSearchParams();
  const invite = searchParams.get("invite") ?? "";

  const [email,    setEmail]    = useState("");
  const [name,     setName]     = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // 클라이언트 1차 검증(서버에서 재검증).
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    let redirecting = false;
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, invite }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "가입에 실패했습니다. 다시 시도해주세요.");
        return;
      }

      // 가입 성공 → 즉시 로그인(하드 내비게이션으로 세션 재조회, login 페이지와 동일 규약).
      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.ok) {
        redirecting = true;
        window.location.assign(DEFAULT_REDIRECT);
      } else {
        // 가입은 됐으나 자동 로그인 실패 → 로그인 페이지로 안내.
        redirecting = true;
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("가입 오류:", err);
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      if (!redirecting) setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {invite && (
        <p className="text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          초대 링크로 접속하셨습니다. 아래 정보로 가입을 완료해주세요.
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          required
          autoComplete="email"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이름 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="홍길동"
          autoComplete="name"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`최소 ${PASSWORD_MIN_LENGTH}자`}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="비밀번호 재입력"
          required
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "가입 중..." : "가입하기"}
      </button>
    </form>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">회원가입</h1>
          <p className="text-sm text-gray-500">이메일과 비밀번호로 새 계정을 만듭니다.</p>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse bg-gray-50 rounded-xl" />}>
          <SignupForm />
        </Suspense>
        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-blue-500 hover:text-blue-600">
            이미 계정이 있으신가요? 로그인 →
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400 text-center">
          가입 시 개인정보 처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}
