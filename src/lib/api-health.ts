import { prisma } from "@/lib/prisma";
import { loggedFetch } from "@/lib/logged-fetch";

/**
 * 외부 API 헬스체크 로직 (규격 §2·§8).
 *
 * 대상 6종을 읽기전용 경량 핑으로 점검하고 ExternalApiHealth 에 upsert 한다.
 *
 * 규격 §8 미확정 항목 확정 사항:
 *  2) OpenFIGI(레이트리밋 25req/분·10건/요청)는 실호출 대신 최근 'gurus' 수집 성공
 *     이력으로 상태를 추정한다(OpenFIGI 는 13F CUSIP→티커 매핑에서만 쓰임). 헬스체크가
 *     레이트리밋을 잠식하지 않게 하기 위함.
 *  4) OpenRouter 402/크레딧 소진은 "down" 이 아니라 "degraded"(크레딧 부족)로 표기.
 *
 * 모든 핑은 8초 타임아웃. EDGAR 는 User-Agent 필수.
 */

export type ApiKey = "NAVER" | "DART" | "EDGAR" | "OPENFIGI" | "OPENROUTER" | "OECD";
export type HealthStatus = "up" | "down" | "degraded" | "unknown";

export interface HealthResult {
  apiKey: ApiKey;
  status: HealthStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  message: string | null;
  /** true 면 lastSuccessAt 를 갱신한다. */
  ok: boolean;
  /** ok=true 인데 실제 핑이 아닌 추정일 때 성공 시각 override(예: OpenFIGI). */
  lastSuccessAt?: Date;
}

const TIMEOUT_MS = 8_000;
const EDGAR_UA = "investing-manager/1.0 admin@example.com";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<{ res: Response | null; latencyMs: number; error: string | null }> {
  const t0 = Date.now();
  try {
    const res = await loggedFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { res, latencyMs: Date.now() - t0, error: null };
  } catch (err) {
    return { res: null, latencyMs: Date.now() - t0, error: String(err) };
  }
}

function down(apiKey: ApiKey, latencyMs: number, error: string | null): HealthResult {
  return { apiKey, status: "down", httpStatus: null, latencyMs, message: error ?? "도달 실패", ok: false };
}

// ── 개별 핑 ────────────────────────────────────────────────────────────────

async function checkNaver(): Promise<HealthResult> {
  // 삼성전자(005930) main 페이지 — 가장 가벼운 읽기전용 요청.
  const { res, latencyMs, error } = await timedFetch(
    "https://finance.naver.com/item/main.naver?code=005930",
    { headers: { "User-Agent": BROWSER_UA } },
  );
  if (!res) return down("NAVER", latencyMs, error);
  const ok = res.status === 200;
  return {
    apiKey: "NAVER",
    status: ok ? "up" : "degraded",
    httpStatus: res.status,
    latencyMs,
    message: ok ? null : `HTTP ${res.status}`,
    ok,
  };
}

async function checkDart(): Promise<HealthResult> {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return { apiKey: "DART", status: "unknown", httpStatus: null, latencyMs: null, message: "DART_API_KEY 미설정", ok: false };
  }
  // list.json 1건 — DART 응답 status 코드로 키/서비스 상태 판정.
  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&page_count=1`;
  const { res, latencyMs, error } = await timedFetch(url);
  if (!res) return down("DART", latencyMs, error);
  if (res.status !== 200) {
    return { apiKey: "DART", status: "degraded", httpStatus: res.status, latencyMs, message: `HTTP ${res.status}`, ok: false };
  }
  try {
    const j = (await res.json()) as { status?: string; message?: string };
    const s = j.status;
    // "000"=정상, "013"=조회 데이터 없음(서비스는 정상)
    if (s === "000" || s === "013") {
      return { apiKey: "DART", status: "up", httpStatus: 200, latencyMs, message: null, ok: true };
    }
    // "010" 등록되지 않은 키, "011" 사용할 수 없는 키, "020" 요청 제한 초과
    return {
      apiKey: "DART",
      status: "degraded",
      httpStatus: 200,
      latencyMs,
      message: `DART status ${s}${j.message ? ` (${j.message})` : ""}`,
      ok: false,
    };
  } catch {
    return { apiKey: "DART", status: "degraded", httpStatus: 200, latencyMs, message: "JSON 파싱 실패", ok: false };
  }
}

async function checkEdgar(): Promise<HealthResult> {
  // Buffett CIK submissions JSON — User-Agent 필수(규격).
  const { res, latencyMs, error } = await timedFetch(
    "https://data.sec.gov/submissions/CIK0001067983.json",
    { headers: { "User-Agent": EDGAR_UA } },
  );
  if (!res) return down("EDGAR", latencyMs, error);
  const ok = res.status === 200;
  return {
    apiKey: "EDGAR",
    status: ok ? "up" : res.status === 403 ? "down" : "degraded",
    httpStatus: res.status,
    latencyMs,
    message: ok ? null : `HTTP ${res.status}${res.status === 403 ? " (User-Agent 누락?)" : ""}`,
    ok,
  };
}

async function checkOpenFigi(): Promise<HealthResult> {
  // 레이트리밋 보호: 실호출 대신 최근 'gurus' 수집 성공 이력으로 추정(§8-2).
  const lastGuru = await prisma.collectionRun.findFirst({
    where: { job: "gurus" },
    orderBy: { startedAt: "desc" },
  });
  if (!lastGuru) {
    return {
      apiKey: "OPENFIGI",
      status: "unknown",
      httpStatus: null,
      latencyMs: null,
      message: "추정: 최근 13F 수집 이력 없음",
      ok: false,
    };
  }
  const ageDays = (Date.now() - lastGuru.startedAt.getTime()) / 86_400_000;
  const ageStr = `${ageDays.toFixed(0)}일 전`;
  if (lastGuru.status === "success" && ageDays <= 14) {
    return {
      apiKey: "OPENFIGI",
      status: "up",
      httpStatus: null,
      latencyMs: null,
      message: `추정: 최근 13F 수집 성공(${ageStr})`,
      ok: true,
      lastSuccessAt: lastGuru.finishedAt,
    };
  }
  if (lastGuru.status === "failed") {
    return {
      apiKey: "OPENFIGI",
      status: "degraded",
      httpStatus: null,
      latencyMs: null,
      message: `추정: 최근 13F 수집 실패(${ageStr})`,
      ok: false,
    };
  }
  return {
    apiKey: "OPENFIGI",
    status: "unknown",
    httpStatus: null,
    latencyMs: null,
    message: `추정: 최근 13F 수집 ${ageStr}(오래됨/부분)`,
    ok: false,
  };
}

async function checkOpenRouter(): Promise<HealthResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return { apiKey: "OPENROUTER", status: "unknown", httpStatus: null, latencyMs: null, message: "OPENROUTER_API_KEY 미설정", ok: false };
  }
  // /key 엔드포인트 — 키 유효성 + 크레딧 잔액 확인(읽기전용, 토큰 비소모).
  const { res, latencyMs, error } = await timedFetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res) return down("OPENROUTER", latencyMs, error);
  if (res.status === 200) {
    try {
      const j = (await res.json()) as { data?: { limit?: number | null; usage?: number } };
      const limit = j.data?.limit;
      const usage = j.data?.usage ?? 0;
      if (limit != null && limit - usage <= 0) {
        // 크레딧 소진 → down 이 아니라 degraded(§8-4).
        return { apiKey: "OPENROUTER", status: "degraded", httpStatus: 200, latencyMs, message: `크레딧 부족 (usage ${usage}/${limit})`, ok: false };
      }
      return {
        apiKey: "OPENROUTER",
        status: "up",
        httpStatus: 200,
        latencyMs,
        message: limit == null ? "잔액 정상(무제한)" : `잔액 정상 (remaining ${(limit - usage).toFixed(2)})`,
        ok: true,
      };
    } catch {
      return { apiKey: "OPENROUTER", status: "up", httpStatus: 200, latencyMs, message: "키 유효", ok: true };
    }
  }
  if (res.status === 401 || res.status === 403) {
    return { apiKey: "OPENROUTER", status: "down", httpStatus: res.status, latencyMs, message: "키 인증 실패", ok: false };
  }
  if (res.status === 402) {
    // 크레딧 부족(§8-4): degraded 로 구분.
    return { apiKey: "OPENROUTER", status: "degraded", httpStatus: 402, latencyMs, message: "크레딧 부족(402)", ok: false };
  }
  return { apiKey: "OPENROUTER", status: "degraded", httpStatus: res.status, latencyMs, message: `HTTP ${res.status}`, ok: false };
}

async function checkOecd(): Promise<HealthResult> {
  // 한국 CLI 1시리즈 최소 요청 — collect-cli.mjs 와 동일 BASE.
  const url =
    "https://stats.oecd.org/sdmx-json/data/MEI_CLI/KOR.LOLITOAA.STSA/OECD?startTime=2024-01&format=json";
  const { res, latencyMs, error } = await timedFetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res) return down("OECD", latencyMs, error);
  const ok = res.status === 200;
  return {
    apiKey: "OECD",
    status: ok ? "up" : "degraded",
    httpStatus: res.status,
    latencyMs,
    message: ok ? null : `HTTP ${res.status}`,
    ok,
  };
}

/**
 * 실제 사용(헬스 핑이 아닌 실호출)에서 관측한 단건 결과를 ExternalApiHealth 에 기록한다.
 * 예: 린치 분석의 OpenRouter 호출 — 실사용 지연/성공/오류를 대시보드에 반영해
 * "지금 점검"뿐 아니라 실제 호출 활동도 API 로그에 보이게 한다.
 * 계측이 호출 본체를 죽이면 안 되므로 실패는 삼키고 로그만 남긴다.
 */
export async function recordApiHealthObservation(obs: {
  apiKey: ApiKey;
  status: HealthStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  message: string | null;
  ok: boolean;
}): Promise<void> {
  const now = new Date();
  try {
    await prisma.externalApiHealth.upsert({
      where: { apiKey: obs.apiKey },
      create: {
        apiKey: obs.apiKey,
        status: obs.status,
        httpStatus: obs.httpStatus,
        latencyMs: obs.latencyMs,
        lastSuccessAt: obs.ok ? now : null,
        lastCheckedAt: now,
        message: obs.message,
      },
      update: {
        status: obs.status,
        httpStatus: obs.httpStatus,
        latencyMs: obs.latencyMs,
        ...(obs.ok ? { lastSuccessAt: now } : {}),
        lastCheckedAt: now,
        message: obs.message,
      },
    });
  } catch (err) {
    console.error(`[api-health] 관측 기록 실패 ${obs.apiKey}:`, err);
  }
}

// ── 오케스트레이터 ───────────────────────────────────────────────────────────

/**
 * 6종 API 를 병렬 점검하고 ExternalApiHealth 에 upsert 한다.
 * 각 핑은 독립 실패 격리(개별 핑 throw 가 전체를 죽이지 않음 — Promise.allSettled).
 * 쓰기는 6행뿐이라 배치 불필요.
 */
export async function checkAllApiHealth(): Promise<HealthResult[]> {
  const settled = await Promise.allSettled([
    checkNaver(),
    checkDart(),
    checkEdgar(),
    checkOpenFigi(),
    checkOpenRouter(),
    checkOecd(),
  ]);

  const apiKeys: ApiKey[] = ["NAVER", "DART", "EDGAR", "OPENFIGI", "OPENROUTER", "OECD"];
  const results: HealthResult[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          apiKey: apiKeys[i],
          status: "down" as HealthStatus,
          httpStatus: null,
          latencyMs: null,
          message: `점검 예외: ${String(s.reason)}`,
          ok: false,
        },
  );

  const now = new Date();
  await Promise.all(
    results.map((r) =>
      prisma.externalApiHealth.upsert({
        where: { apiKey: r.apiKey },
        create: {
          apiKey: r.apiKey,
          status: r.status,
          httpStatus: r.httpStatus,
          latencyMs: r.latencyMs,
          lastSuccessAt: r.ok ? r.lastSuccessAt ?? now : null,
          lastCheckedAt: now,
          message: r.message,
        },
        update: {
          status: r.status,
          httpStatus: r.httpStatus,
          latencyMs: r.latencyMs,
          // 성공일 때만 마지막 성공 시각 갱신(실패해도 직전 성공 시각 보존).
          ...(r.ok ? { lastSuccessAt: r.lastSuccessAt ?? now } : {}),
          lastCheckedAt: now,
          message: r.message,
        },
      }),
    ),
  );

  return results;
}
