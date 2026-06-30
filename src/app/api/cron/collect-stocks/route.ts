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

// 내부 서브청크 크기(한 번의 collectAllStocks 호출 단위).
// PARALLEL=10 이므로 SUB=20 = 2 서브배치. 외부 fetch 타임아웃(10s) 최악 가정에도
// 한 서브청크는 ~20s 안에 끝나 60s 한도 아래에서 안전하게 멈출 수 있다.
const SUB = 20;

// 한 invocation 의 "드레인 예산"(wall-clock). 이 시간을 넘기면 새 서브청크를 시작하지
// 않고 다음 invocation 으로 체이닝한다. SOFT_BUDGET(30s) + 최악 서브청크(~20s) ≈ 50s 로
// 60s 한도 아래 안전. 정상(서브청크 ~5-8s)이면 invocation 당 ~100종목을 처리해
// 200종목을 1~2 hop 으로 커버한다.
//
// 배경(2026-06-30 진단): 기존 SLICE=40 단일청크 + 5-hop 선형 self-chaining 은
// 매일 정확히 3슬라이스(120종목)에서 죽었다(라이브 4일 연속 main.naver 호출=120/일,
// stocks CollectionRun 미기록으로 확인). fire-and-forget 자기호출 체인이 ~4 hop 까지만
// 살아남고 5번째 트리거가 결정론적으로 유실됐다. hop 수를 5→1~2 로 줄여 구조적 해소.
const SOFT_BUDGET_MS = 30_000;

export const dynamic = "force-dynamic";
// 단일 슬라이스(40종목)는 보통 ~10-20s 로 끝난다. Hobby 한도(60s) 안에서 안전.
// 슬라이스 분할이 핵심이고 maxDuration 은 안전 여유일 뿐이므로 60 으로 고정.
export const maxDuration = 60;

/**
 * 주가 스냅샷을 "드레인 루프 + self-chaining" 으로 수집하는 엔드포인트(순수 수집).
 *
 * - startOffset 부터 SUB(20)종목 서브청크를 wall-clock 예산(SOFT_BUDGET_MS) 안에서
 *   연속 처리한다. 한 invocation 이 정상적으로 ~80-100종목을 커버한다.
 * - 예산 초과로 남은 종목이 있으면 다음 invocation 을 fire-and-forget 으로 트리거한다.
 *   → 어떤 단일 함수 실행도 예산+최악서브청크(~50s)를 넘지 않아 60s 타임아웃 구조적 회피.
 *   → 동시에 self-chaining hop 수를 5→1~2 로 줄여, fire-and-forget 자기호출 체인이
 *     ~4 hop 까지만 살아남던 결정론적 부분적재(매일 120/200) 문제를 해소(2026-06-30 진단).
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
async function run(req: NextRequest, startOffset: number, acc: SliceAcc) {
  const out: Record<string, unknown> = { ok: true, startOffset };
  let sliceOk = 0;
  let sliceFailed = 0;
  let sliceProcessed = 0;
  let sliceError: string | null = null;

  // 처리 대상 유니버스 크기(rank 보유 우선). 드레인 루프 종료 판정에 사용.
  let totalStocks: number;
  try {
    const rankedCount = await prisma.stock.count({ where: { rank: { not: null } } });
    totalStocks = rankedCount > 0 ? rankedCount : await prisma.stock.count();
  } catch (err) {
    // 카운트 실패 시 보수적으로 startOffset+SUB 만 처리하고 다음 hop 으로 넘긴다.
    totalStocks = startOffset + SUB + 1;
    console.error(`[cron:collect-stocks] 유니버스 카운트 실패:`, err);
  }
  out.totalStocks = totalStocks;

  // 1. 드레인 루프 — wall-clock 예산 안에서 SUB 단위 서브청크를 연속 처리한다.
  //    이렇게 invocation 당 다수 종목(정상 ~100)을 처리해 self-chaining hop 수를
  //    최소화(5→1~2)하고, 예산 초과 직전에 멈춰 60s 타임아웃을 구조적으로 회피한다.
  const invStart = Date.now();
  let offset = startOffset;
  while (offset < totalStocks) {
    try {
      const result = await collectAllStocks(undefined, { offset, limit: SUB });
      sliceProcessed += result.total;
      sliceOk += result.updated;
      sliceFailed += result.failed.length;
    } catch (err) {
      out.ok = false;
      out.collectError = String(err);
      sliceError = sliceError ?? String(err);
      console.error(`[cron:collect-stocks] 서브청크 수집 실패 offset=${offset}:`, err);
    }
    offset += SUB;
    // 예산 초과면 새 서브청크를 시작하지 않고 남은 구간을 다음 invocation 에 넘긴다.
    if (Date.now() - invStart >= SOFT_BUDGET_MS) break;
  }
  out.processed = sliceProcessed;
  out.updated = sliceOk;
  out.failed = sliceFailed;
  out.endOffset = offset;

  // 누산기 갱신(이 invocation 결과 반영) — 체이닝/기록 단계에서 사용.
  const nextAcc: SliceAcc = {
    startedAt: acc.startedAt,
    ok: acc.ok + sliceOk,
    failed: acc.failed + sliceFailed,
    error: acc.error ?? sliceError,
  };

  // 2. 다음 invocation 체이닝 — 수집 성패와 무관하게 남은 종목이 있으면 진행.
  //    마지막 hop(hasMore=false)에서만 잡 단위 집계 1행을 기록(§8-1).
  try {
    const nextOffset = offset;
    const hasMore = nextOffset < totalStocks;
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
