import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collectAllStocks } from "@/lib/stock-collector";
import { refreshStockUniverse } from "@/lib/universe";
import { getBaseUrl, isAuthorizedCron, triggerNextSlice } from "@/lib/cron-self";

// 슬라이스당 처리 종목 수.
// PARALLEL=10, BATCH_DELAY=600ms 기준 한 슬라이스(=SLICE/10 서브배치)는
// 외부 fetch 타임아웃(10s)을 감안해도 안전하게 타임아웃 한참 아래에서 끝난다.
// 200종목 / 40 = 5 슬라이스로 전체 커버.
const SLICE = 40;

export const dynamic = "force-dynamic";
// 단일 슬라이스(40종목)는 보통 ~10-20s 로 끝난다. Hobby 한도(60s) 안에서 안전.
// 슬라이스 분할이 핵심이고 maxDuration 은 안전 여유일 뿐이므로 60 으로 고정.
export const maxDuration = 60;

/**
 * 주가 스냅샷을 "슬라이스 단위"로 수집하는 self-chaining 엔드포인트.
 *
 * - offset/limit 으로 유니버스의 일부만 처리한다.
 * - offset === 0 일 때만 시총 유니버스를 1회 갱신한다.
 * - 처리 후 남은 종목이 있으면 다음 슬라이스를 fire-and-forget 으로 트리거한다.
 *   → 어떤 단일 함수 실행도 SLICE 개 종목 이상을 처리하지 않으므로 504 구조적 해소.
 *
 * 인증: Vercel Cron 헤더 또는 내부 self-fetch(CRON_SECRET). GET/POST 모두 허용
 * (Vercel Cron 은 GET, 내부 체이닝은 POST).
 */
async function run(req: NextRequest, offset: number) {
  let universe: unknown = null;
  if (offset === 0) {
    // 첫 슬라이스에서만 유니버스 갱신 (순위 변동 반영)
    universe = await refreshStockUniverse(200);
  }

  const result = await collectAllStocks(undefined, { offset, limit: SLICE });

  // 다음 슬라이스 판단: rank 보유 종목 수 기준(없으면 전체)
  const rankedCount = await prisma.stock.count({ where: { rank: { not: null } } });
  const totalStocks = rankedCount > 0 ? rankedCount : await prisma.stock.count();
  const nextOffset = offset + SLICE;
  const hasMore = nextOffset < totalStocks;

  if (hasMore) {
    const baseUrl = getBaseUrl(req);
    await triggerNextSlice(baseUrl, "/api/cron/collect-stocks", { offset: nextOffset });
  }

  return {
    ok: true,
    offset,
    limit: SLICE,
    processed: result.total,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed.length,
    totalStocks,
    nextOffset: hasMore ? nextOffset : null,
    universe,
    runAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Vercel Cron 진입점 = 항상 offset 0 부터
  const out = await run(req, 0);
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { offset?: number };
  const offset = Math.max(0, body.offset ?? 0);
  const out = await run(req, offset);
  return NextResponse.json(out);
}
