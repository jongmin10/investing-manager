import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collectAllStocks } from "@/lib/stock-collector";
import { getBaseUrl, isAuthorizedCron, triggerNextSlice } from "@/lib/cron-self";
import { recordCollectionRun } from "@/lib/collection-run";

/**
 * 슬라이스 간 전달되는 누산기(§8-1 잡 단위 집계 1행).
 * offset 0 슬라이스에서 시작값을 만들고, 각 슬라이스가 자기 결과를 더해 body 로 넘긴다.
 * 마지막 슬라이스(hasMore=false)에서만 누적 totals 로 CollectionRun 1행을 기록한다.
 */
interface SliceAcc {
  startedAt: number; // 잡 시작 epoch ms (offset 0 기준)
  ok: number; // 누적 성공(updated) 건수
  failed: number; // 누적 실패 건수
  error: string | null; // 첫 슬라이스 수집 에러(있으면 partial/failed)
}

function freshAcc(): SliceAcc {
  return { startedAt: Date.now(), ok: 0, failed: 0, error: null };
}

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
 * 주가 스냅샷을 "슬라이스 단위"로 수집하는 self-chaining 엔드포인트(순수 수집).
 *
 * - offset/limit 으로 유니버스의 일부만 처리한다.
 * - 처리 후 남은 종목이 있으면 다음 슬라이스를 fire-and-forget 으로 트리거한다.
 *   → 어떤 단일 함수 실행도 SLICE 개 종목 이상을 처리하지 않으므로 504 구조적 해소.
 * - 시총 유니버스 갱신은 이 핸들러에서 하지 않는다. 별도 `/api/cron/refresh-universe`
 *   가 갱신을 끝낸 뒤 이 핸들러의 offset 0 을 트리거한다(2026-06 분리). 유니버스+수집을
 *   한 invocation 에서 돌리면 60s 를 초과해 FUNCTION_INVOCATION_TIMEOUT 이 났기 때문.
 *
 * 인증: Vercel Cron 헤더 또는 내부 self-fetch(CRON_SECRET). GET/POST 모두 허용.
 *
 * 하드닝(2026-06): 각 단계(수집/체이닝)를 독립적으로 실패 격리한다. 수집이 throw 해도
 * 슬라이스를 500 으로 죽이지 않고 다음 슬라이스 트리거를 보장해 체인 생존을 유지하며,
 * 실패 원인을 응답/로그에 남겨(collectError/chainError) 관측 가능하게 한다.
 */
async function run(req: NextRequest, offset: number, acc: SliceAcc) {
  const out: Record<string, unknown> = { ok: true, offset, limit: SLICE };
  let sliceOk = 0;
  let sliceFailed = 0;
  let sliceError: string | null = null;

  // 1. 주가 수집 — 실패해도 다음 슬라이스 체이닝은 계속한다.
  try {
    const result = await collectAllStocks(undefined, { offset, limit: SLICE });
    out.processed = result.total;
    out.updated = result.updated;
    out.skipped = result.skipped;
    out.failed = result.failed.length;
    sliceOk = result.updated;
    sliceFailed = result.failed.length;
  } catch (err) {
    out.ok = false;
    out.collectError = String(err);
    sliceError = String(err);
    console.error(`[cron:collect-stocks] 슬라이스 수집 실패 offset=${offset}:`, err);
  }

  // 누산기 갱신(이 슬라이스 결과 반영) — 체이닝/기록 단계에서 사용.
  const nextAcc: SliceAcc = {
    startedAt: acc.startedAt,
    ok: acc.ok + sliceOk,
    failed: acc.failed + sliceFailed,
    error: acc.error ?? sliceError,
  };

  // 2. 다음 슬라이스 체이닝 — 현재 슬라이스 성패와 무관하게 남은 종목이 있으면 진행.
  //    마지막 슬라이스(hasMore=false)에서만 잡 단위 집계 1행을 기록(§8-1).
  try {
    const rankedCount = await prisma.stock.count({ where: { rank: { not: null } } });
    const totalStocks = rankedCount > 0 ? rankedCount : await prisma.stock.count();
    const nextOffset = offset + SLICE;
    const hasMore = nextOffset < totalStocks;
    out.totalStocks = totalStocks;
    out.nextOffset = hasMore ? nextOffset : null;

    if (hasMore) {
      await triggerNextSlice(getBaseUrl(req), "/api/cron/collect-stocks", {
        offset: nextOffset,
        _acc: nextAcc,
      });
    } else {
      await recordCollectionRun("stocks", new Date(nextAcc.startedAt), {
        itemsOk: nextAcc.ok,
        itemsFailed: nextAcc.failed,
        error: nextAcc.error,
      });
      out.runRecorded = true;
    }
  } catch (err) {
    out.chainError = String(err);
    console.error(`[cron:collect-stocks] 다음 슬라이스 트리거 실패 offset=${offset}:`, err);
  }

  out.runAt = new Date().toISOString();
  return out;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Vercel Cron 진입점 = 항상 offset 0 부터 (새 누산기 시작)
  const out = await run(req, 0, freshAcc());
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { offset?: number; _acc?: SliceAcc };
  const offset = Math.max(0, body.offset ?? 0);
  // _acc 없으면(외부/유니버스 트리거의 offset 0) 새 누산기 시작.
  const acc = body._acc ?? freshAcc();
  const out = await run(req, offset, acc);
  return NextResponse.json(out);
}
