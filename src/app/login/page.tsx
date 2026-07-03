"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const DEFAULT_REDIRECT = "/portfolio";

/**
 * 오픈 리다이렉트 방어.
 * 내부 경로(/로 시작하되 //는 아닌)만 허용하고 외부 URL은 거부한다.
 */
function isSafeInternalUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

function LoginForm() {
  const searchParams = useSearchParams();

  // 가입 완료 후 전환된 경우: ?registered=1&email=... → 안내 배너 + 이메일 프리필.
  const justRegistered = searchParams.get("registered") === "1";

  const [callbackUrl, setCallbackUrl] = useState<string>(DEFAULT_REDIRECT);
  const [email,       setEmail]       = useState(() => searchParams.get("email") ?? "");
  const [password,    setPassword]    = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  /**
   * callbackUrl 결정 우선순위:
   * 1. 쿼리 파라미터 ?callbackUrl=... (미들웨어가 보호 경로 진입 시 주입)
   * 2. document.referrer — 동일 origin이고 /login이 아닌 경우 (직접 /login 진입 시 이전 페이지)
   * 3. 기본값 /portfolio
   *
   * useEffect 내에서 브라우저 전용 API(document.referrer)에 접근해야 하므로 클라이언트 전용.
   */
  useEffect(() => {
    const fromQuery = searchParams.get("callbackUrl");
    if (fromQuery && isSafeInternalUrl(fromQuery)) {
      setCallbackUrl(fromQuery);
      return;
    }

    try {
      const ref = document.referrer;
      if (ref) {
        const refUrl = new URL(ref);
        // /login·/signup 은 인증 진입 페이지라 이전 페이지로 취급하지 않는다.
        // (가입 완료 후 /signup→/login 전환 시 referrer=/signup 을 콜백으로 잡아
        //  로그인 후 다시 회원가입 화면으로 돌아가던 버그 방지.)
        const isAuthEntryPage = refUrl.pathname === "/login" || refUrl.pathname === "/signup";
        if (refUrl.origin === window.location.origin && !isAuthEntryPage) {
          const internalPath = refUrl.pathname + refUrl.search;
          if (isSafeInternalUrl(internalPath)) {
            setCallbackUrl(internalPath);
            return;
          }
        }
      }
    } catch {
      // referrer 파싱 실패는 무시하고 기본값 사용
    }

    setCallbackUrl(DEFAULT_REDIRECT);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");

    /**
     * 성공 경로에서는 하드 내비게이션(window.location.assign)을 사용한다.
     * router.push + router.refresh(소프트 내비게이션)은 SessionProvider의 인메모리
     * 세션 캐시를 갱신하지 못해 Sidebar/AuthButton이 status==="loading" 스켈레톤에
     * 고착되는 버그가 발생한다. 하드 내비게이션은 앱을 완전 리마운트하므로
     * SessionProvider가 새 쿠키로 세션을 재조회한다.
     */
    let redirecting = false;

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("로그인에 실패했습니다. 다시 시도해주세요.");
      } else if (res?.ok) {
        redirecting = true;
        // 하드 내비게이션: 페이지 언로드까지 로딩 상태 유지(UX 일관성)
        window.location.assign(callbackUrl);
      } else {
        setError("알 수 없는 오류가 발생했습니다.");
      }
    } catch (err) {
      console.error("로그인 오류:", err);
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      // 성공(redirecting) 경로는 페이지 언로드 중이므로 loading 리셋 생략.
      // 실패/에러 경로에서만 loading 리셋해 버튼이 다시 활성화되도록 한다.
      if (!redirecting) {
        setLoading(false);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {justRegistered && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          가입이 완료되었습니다. 방금 만든 계정으로 로그인해주세요.
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
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          required
          autoComplete="current-password"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
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
        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-gray-500">
            계정이 없으신가요?{" "}
            <Link href="/signup" className="text-blue-500 hover:text-blue-600 font-medium">
              회원가입
            </Link>
          </p>
          <Link href="/" className="inline-block text-sm text-gray-400 hover:text-gray-600">
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
