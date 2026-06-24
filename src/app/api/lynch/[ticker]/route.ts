import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  runLynchAnalysis,
  resolveStockMeta,
  LYNCH_DATA_LIMITATIONS,
} from "@/lib/lynch-analyzer";
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
// body: { force?: boolean }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const invalid = validateTicker(ticker);
  if (invalid) return invalid;

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const force = body.force === true;

  const meta = await resolveStockMeta(ticker);
  if (!meta.ok) return NextResponse.json({ error: meta.message }, { status: meta.code });

  const key = { ticker_snapshotDate: { ticker, snapshotDate: meta.snapshotDate } };
  const existing = await prisma.lynchAnalysis.findUnique({
    where: key,
    select: { id: true, status: true, result: true, generatedAt: true, error: true, updatedAt: true },
  });

  // 캐시 히트: done 이고 force 아니면 즉시 반환
  if (existing?.status === "done" && !force) {
    return NextResponse.json(toResponse(meta, ticker, existing));
  }

  // 인플라이트 락: pending 이고 3분 이내면 중복 트리거 무시 (현 상태 반환)
  if (existing?.status === "pending" && Date.now() - existing.updatedAt.getTime() < INFLIGHT_MS) {
    return NextResponse.json(toResponse(meta, ticker, existing));
  }

  // pending 으로 upsert (신규 또는 failed/stale 재시작)
  const row = await prisma.lynchAnalysis.upsert({
    where: key,
    create: {
      ticker,
      snapshotDate: meta.snapshotDate,
      status: "pending",
    },
    update: {
      status: "pending",
      result: null,
      error: null,
    },
    select: { id: true },
  });

  // 백그라운드 실행 (응답을 막지 않음). maxDuration 60s 내 LLM(55s timeout) 완료 설계.
  // after(): 응답 반환 후에도 Vercel 이 태스크 완료를 보장한다. void fire-and-forget 은
  // 응답 직후 Lambda 가 freeze 되면 분석이 중단돼 DB 가 pending 으로 영구 고착될 수 있다.
  after(() =>
    runLynchAnalysis(row.id, ticker).catch(() => {
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
