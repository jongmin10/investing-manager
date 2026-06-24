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
 *
 * 하드닝(2026-06): collect-stocks 와 동일한 단일 실패점 제거. 수집이 throw 해도
 * 슬라이스를 500 으로 죽이지 않고 다음 슬라이스 트리거를 보장해 체인 생존을 유지하며,
 * 실패 원인을 응답/로그에 남겨 관측 가능하게 한다.
 */
async function run(req: NextRequest, offset: number) {
  if (!process.env.DART_API_KEY) {
    return { ok: true, skipped: "no DART_API_KEY", offset };
  }

  const out: Record<string, unknown> = { ok: true, offset, limit: SLICE };

  // 1. 재무 수집 — 실패해도 다음 슬라이스 체이닝은 계속한다.
  try {
    const { collectAllFinancials } = await import("@/lib/dart-collector");
    const result = await collectAllFinancials({ offset, limit: SLICE });
    out.updated = result.updated;
    out.failed = result.failed.length;
  } catch (err) {
    out.ok = false;
    out.collectError = String(err);
    console.error(`[cron:collect-financials] 슬라이스 수집 실패 offset=${offset}:`, err);
  }

  // 2. 다음 슬라이스 체이닝 — 현재 슬라이스 성패와 무관하게 남은 종목이 있으면 진행.
  try {
    const totalStocks = await prisma.stock.count();
    const nextOffset = offset + SLICE;
    const hasMore = nextOffset < totalStocks;
    out.totalStocks = totalStocks;
    out.nextOffset = hasMore ? nextOffset : null;

    if (hasMore) {
      await triggerNextSlice(getBaseUrl(req), "/api/cron/collect-financials", { offset: nextOffset });
    }
  } catch (err) {
    out.chainError = String(err);
    console.error(`[cron:collect-financials] 다음 슬라이스 트리거 실패 offset=${offset}:`, err);
  }

  out.runAt = new Date().toISOString();
  return out;
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
