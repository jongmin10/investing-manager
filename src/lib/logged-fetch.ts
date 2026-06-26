import { prisma } from "@/lib/prisma";

/**
 * 외부 API 요청 로깅 래퍼 (관리자 'API 요청 로그' 모니터링용).
 *
 * 시스템이 호출하는 모든 외부 API 요청을 ApiRequestLog 에 요청당 1행으로 적재한다.
 * 표시 컬럼: Date/Time · Request URL · Response Code · Response Time.
 *
 * 설계 원칙:
 * - 로깅이 호출 본체를 죽이거나 느리게 하면 안 된다 → 적재는 fire-and-forget(await 안 함),
 *   실패는 삼키고 로그만. 호출자는 평소처럼 Response 를 받거나 예외를 그대로 받는다.
 * - URL 의 비밀 쿼리파라미터(crtfc_key 등)는 마스킹 후 저장(자격증명 노출 방지).
 * - 대량 수집은 수백~수천 요청을 만들므로 보존 7일(적재 시 throttled best-effort 정리).
 *   Supabase 풀 부담을 줄이려 정리는 최대 5분에 1회만 수행한다.
 */

export type ApiSource = "NAVER" | "DART" | "EDGAR" | "OPENFIGI" | "OPENROUTER" | "OECD";

const MAX_URL_LEN = 500;
const MAX_ERROR_LEN = 300;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const CLEANUP_MIN_INTERVAL_MS = 5 * 60 * 1000; // 정리 최소 간격 5분

// 마스킹 대상 쿼리파라미터(대소문자 무시). 값은 *** 로 치환.
const SECRET_PARAMS = new Set(["crtfc_key", "key", "apikey", "api_key", "token", "secret", "password", "access_token"]);

/** 호스트로 API 소스를 추정(meta.apiKey 미지정 시 폴백). */
function inferSource(host: string): string {
  if (host.includes("naver.com")) return "NAVER";
  if (host.includes("opendart.fss.or.kr")) return "DART";
  if (host.includes("sec.gov")) return "EDGAR";
  if (host.includes("openfigi.com")) return "OPENFIGI";
  if (host.includes("openrouter.ai")) return "OPENROUTER";
  if (host.includes("oecd.org")) return "OECD";
  if (host.includes("yahoo.com")) return "YAHOO";
  return host;
}

/** URL 의 비밀 쿼리파라미터를 마스킹하고 길이를 제한해 반환. */
function sanitizeUrl(raw: string): { url: string; source: string } {
  try {
    const u = new URL(raw);
    for (const [k] of u.searchParams) {
      if (SECRET_PARAMS.has(k.toLowerCase())) u.searchParams.set(k, "***");
    }
    const source = inferSource(u.host);
    let out = u.toString();
    if (out.length > MAX_URL_LEN) out = out.slice(0, MAX_URL_LEN) + "…";
    return { url: out, source };
  } catch {
    // URL 파싱 실패 시 원문을 길이만 제한해 보존.
    const out = raw.length > MAX_URL_LEN ? raw.slice(0, MAX_URL_LEN) + "…" : raw;
    return { url: out, source: "" };
  }
}

let lastCleanupAt = 0;

/** ApiRequestLog 1행 적재(fire-and-forget). 호출자는 await 하지 않는다. */
function recordApiRequest(row: {
  apiKey: string | null;
  method: string;
  url: string;
  statusCode: number | null;
  responseTimeMs: number;
  ok: boolean;
  error: string | null;
}): void {
  prisma.apiRequestLog
    .create({
      data: {
        apiKey: row.apiKey || null,
        method: row.method,
        url: row.url,
        statusCode: row.statusCode,
        responseTimeMs: row.responseTimeMs,
        ok: row.ok,
        error: row.error ? row.error.slice(0, MAX_ERROR_LEN) : null,
      },
    })
    .then(() => {
      // 보존 정리: 최대 5분에 1회만(throttled). 적재 성공 직후에만 시도.
      const now = Date.now();
      if (now - lastCleanupAt < CLEANUP_MIN_INTERVAL_MS) return;
      lastCleanupAt = now;
      return prisma.apiRequestLog
        .deleteMany({ where: { createdAt: { lt: new Date(now - RETENTION_MS) } } })
        .then(() => undefined);
    })
    .catch((err) => console.error("[logged-fetch] 적재/정리 실패:", err));
}

/**
 * fetch 드롭인 대체 — 외부 API 호출을 ApiRequestLog 에 기록한다.
 * 시그니처는 fetch 와 동일하되, 선택적 meta.apiKey 로 소스를 명시할 수 있다.
 */
export async function loggedFetch(
  input: string,
  init?: RequestInit,
  meta?: { apiKey?: ApiSource },
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const { url, source } = sanitizeUrl(input);
  const apiKey = meta?.apiKey ?? source;
  const t0 = Date.now();
  try {
    const res = await fetch(input, init);
    recordApiRequest({
      apiKey,
      method,
      url,
      statusCode: res.status,
      responseTimeMs: Date.now() - t0,
      ok: res.ok,
      error: null,
    });
    return res;
  } catch (err) {
    // 네트워크 오류/타임아웃(AbortError 포함) — statusCode null 로 기록 후 예외 재전파.
    recordApiRequest({
      apiKey,
      method,
      url,
      statusCode: null,
      responseTimeMs: Date.now() - t0,
      ok: false,
      error: String(err),
    });
    throw err;
  }
}
