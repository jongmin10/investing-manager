import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBaseUrl, isAuthorizedCron, triggerNextSlice } from "@/lib/cron-self";

// DART 재무 수집 슬라이스 크기.
// 종목당 3개 DART API 호출, 내부적으로 CONCURRENCY=4 / WAVE_DELAY=300ms 로 처리.
// 40종목 = 10웨이브 ≈ 외부 응답 포함 수십 초 이내. 200종목 / 40 = 5 슬라이스.
const SLICE = 40;

export const dynamic = "force-dynamic";
// 단일 슬라이스(40종목)는 Hobby 한도(60s) 안에서 끝난다. 슬라이스 분할이 핵심.
export const maxDuration = 60;

/**
 * DART 재무를 슬라이스 단위로 수집하는 self-chaining 엔드포인트.
 * collectAllFinancials 는 이미 offset/limit 을 지원한다.
 * DART_API_KEY 가 없으면 즉시 종료(no-op).
 */
async function run(req: NextRequest, offset: number) {
  if (!process.env.DART_API_KEY) {
    return { ok: true, skipped: "no DART_API_KEY", offset };
  }

  const { collectAllFinancials } = await import("@/lib/dart-collector");
  const result = await collectAllFinancials({ offset, limit: SLICE });

  const totalStocks = await prisma.stock.count();
  const nextOffset = offset + SLICE;
  const hasMore = nextOffset < totalStocks;

  if (hasMore) {
    const baseUrl = getBaseUrl(req);
    await triggerNextSlice(baseUrl, "/api/cron/collect-financials", { offset: nextOffset });
  }

  return {
    ok: true,
    offset,
    limit: SLICE,
    updated: result.updated,
    failed: result.failed.length,
    totalStocks,
    nextOffset: hasMore ? nextOffset : null,
    runAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run(req, 0));
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { offset?: number };
  const offset = Math.max(0, body.offset ?? 0);
  return NextResponse.json(await run(req, offset));
}
