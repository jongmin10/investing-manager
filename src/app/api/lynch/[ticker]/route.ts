import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  runLynchAnalysis,
  resolveStockMeta,
  LYNCH_DATA_LIMITATIONS,
} from "@/lib/lynch-analyzer";
import { resolveLynchModel } from "@/lib/lynch-models";
import type { LynchResponse, LynchResult } from "@/lib/lynch-types";

export const maxDuration = 60;

const TICKER_RE = /^\d{6}$/;
const INFLIGHT_MS = 3 * 60 * 1000; // pending 이 3분 넘게 머무르면 stale → 재트리거 허용

// LynchAnalysis row → LynchResponse 직렬화
function toResponse(
  meta: { name: string; market: "KOSPI" | "KOSDAQ"; sector: string | null },
  ticker: string,
  row: {
    status: string;
    result: string | null;
    generatedAt: Date;
    error: string | null;
  } | null,
): LynchResponse {
  if (!row) {
    return {
      ticker,
      name: meta.name,
      market: meta.market,
      sector: meta.sector,
      status: "pending",
      analyzedAt: null,
      result: null,
      dataLimitations: LYNCH_DATA_LIMITATIONS,
    };
  }

  let result: LynchResult | null = null;
  if (row.status === "done" && row.result) {
    try {
      result = JSON.parse(row.result) as LynchResult;
    } catch {
      result = null;
    }
  }

  return {
    ticker,
    name: meta.name,
    market: meta.market,
    sector: meta.sector,
    status: (row.status === "done" || row.status === "failed" ? row.status : "pending") as LynchResponse["status"],
    analyzedAt: row.status === "done" ? row.generatedAt.toISOString() : null,
    result,
    dataLimitations: LYNCH_DATA_LIMITATIONS,
    ...(row.status === "failed" && row.error ? { error: row.error } : {}),
  };
}

// 입력 검증 — 6자리 숫자만. 미국 티커/비6자리 → 400.
function validateTicker(ticker: string): NextResponse | null {
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { error: "현재 한국 종목(6자리 숫자 코드)만 지원합니다." },
      { status: 400 },
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — 결과 폴링
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const invalid = validateTicker(ticker);
  if (invalid) return invalid;

  const meta = await resolveStockMeta(ticker);
  if (!meta.ok) return NextResponse.json({ error: meta.message }, { status: meta.code });

  // 최신 분석 row (snapshotDate 기준 캐시) 조회
  const row = await prisma.lynchAnalysis.findUnique({
    where: { ticker_snapshotDate: { ticker, snapshotDate: meta.snapshotDate } },
    select: { status: true, result: true, generatedAt: true, error: true },
  });

  return NextResponse.json(toResponse(meta, ticker, row));
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — 분석 트리거 (캐시 히트 즉시 반환 / 없으면 pending 생성 후 백그라운드 실행)
// body: { force?: boolean, model?: string }  (model 은 query ?model= 도 허용)
//   model: 모델 allowlist(LYNCH_MODELS)의 id. 없거나 무효면 기본(haiku)으로 폴백.
// 캐시 키는 [ticker, snapshotDate] 단일 행이지만, 재사용(캐시 히트) 판정에는 model 을
// 포함한다 — 같은 종목·스냅샷이라도 요청 모델이 직전 분석 모델과 다르면 재실행한다
// (다른 모델 캐시가 반환되는 버그 방지). DB unique 제약은 변경하지 않음(마이그레이션 불필요).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const invalid = validateTicker(ticker);
  if (invalid) return invalid;

  const body = (await req.json().catch(() => ({}))) as { force?: boolean; model?: string };
  const force = body.force === true;
  // model: body 우선, 없으면 query(?model=). allowlist 검증 + 무효 시 기본 폴백.
  const requestedModelId = body.model ?? req.nextUrl.searchParams.get("model") ?? null;
  const model = resolveLynchModel(requestedModelId);

  const meta = await resolveStockMeta(ticker);
  if (!meta.ok) return NextResponse.json({ error: meta.message }, { status: meta.code });

  const key = { ticker_snapshotDate: { ticker, snapshotDate: meta.snapshotDate } };
  const existing = await prisma.lynchAnalysis.findUnique({
    where: key,
    select: { id: true, status: true, result: true, generatedAt: true, error: true, updatedAt: true, model: true },
  });

  // 캐시 히트: done 이고 force 아니고 '같은 모델'로 생성된 결과면 즉시 반환.
  // 모델이 다르면 캐시 미스로 간주 → 아래에서 재실행(행 덮어쓰기).
  if (existing?.status === "done" && !force && existing.model === model.id) {
    return NextResponse.json(toResponse(meta, ticker, existing));
  }

  // 인플라이트 락: pending 이고 3분 이내면 중복 트리거 무시 (현 상태 반환).
  // 모델 무관 — 동일 종목·스냅샷에 대한 동시 분석은 1건만 진행시킨다.
  if (existing?.status === "pending" && Date.now() - existing.updatedAt.getTime() < INFLIGHT_MS) {
    return NextResponse.json(toResponse(meta, ticker, existing));
  }

  // pending 으로 upsert (신규 또는 failed/stale/다른모델 재시작). 선택 모델을 기록.
  const row = await prisma.lynchAnalysis.upsert({
    where: key,
    create: {
      ticker,
      snapshotDate: meta.snapshotDate,
      status: "pending",
      model: model.id,
    },
    update: {
      status: "pending",
      result: null,
      error: null,
      model: model.id,
    },
    select: { id: true },
  });

  // 백그라운드 실행 (응답을 막지 않음). maxDuration 60s 내 LLM(55s timeout) 완료 설계.
  // after(): 응답 반환 후에도 Vercel 이 태스크 완료를 보장한다. void fire-and-forget 은
  // 응답 직후 Lambda 가 freeze 되면 분석이 중단돼 DB 가 pending 으로 영구 고착될 수 있다.
  after(() =>
    runLynchAnalysis(row.id, ticker, model.id).catch(() => {
      /* runLynchAnalysis 내부에서 failed 기록 — 여기선 무시 */
    }),
  );

  // 즉시 pending 응답
  return NextResponse.json(
    {
      ticker,
      name: meta.name,
      market: meta.market,
      sector: meta.sector,
      status: "pending",
      analyzedAt: null,
      result: null,
      dataLimitations: LYNCH_DATA_LIMITATIONS,
    } satisfies LynchResponse,
    { status: 202 },
  );
}
