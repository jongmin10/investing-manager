import { NextRequest, NextResponse } from "next/server";
import { refreshStockUniverse } from "@/lib/universe";
import { getBaseUrl, isAuthorizedCron, triggerNextSlice } from "@/lib/cron-self";
import { recordCollectionRun } from "@/lib/collection-run";

export const dynamic = "force-dynamic";
// 유니버스 갱신만 단독 수행(약 ~36s 실측). Hobby 한도(60s) 안에서 안전.
export const maxDuration = 60;

/**
 * 시총 유니버스 갱신 전용 엔드포인트 (self-chaining 1단계).
 *
 * 배경(2026-06): refreshStockUniverse(200)(네이버 시총 200 스크랩 + 200 reset/upsert +
 * DART corp 매핑)를 collect-stocks 슬라이스 0 안에서 40종목 수집과 함께 돌리면
 * 60s 를 초과해 FUNCTION_INVOCATION_TIMEOUT 이 발생했다.
 * (라이브 트리거 실측: collect-stocks offset 0 = 60s 타임아웃 / offset 40 = 24s 성공)
 * 이 타임아웃은 런타임 강제종료라 try/catch 로도 못 잡고, 다음 슬라이스 트리거에
 * 도달하지 못해 매일 offset 40+ 종목이 통째로 미수집됐다.
 *
 * → 유니버스 갱신을 이 전용 invocation 으로 분리하고, 끝나면 collect-stocks 슬라이스 0
 *   (순수 수집, 약 24s)을 트리거해 정상 체이닝(0→40→…→160)을 시작한다.
 *   유니버스 갱신이 실패해도 기존 rank 로 수집을 진행하도록 트리거는 항상 수행한다.
 */
async function run(req: NextRequest) {
  const startedAt = new Date();
  const out: Record<string, unknown> = { ok: true };

  // 1. 시총 유니버스 갱신 (단독). 실패해도 기존 rank 로 수집 진행하므로 비치명.
  try {
    out.universe = await refreshStockUniverse(200);
  } catch (err) {
    out.ok = false;
    out.universeError = String(err);
    console.error("[cron:refresh-universe] 유니버스 갱신 실패(기존 rank로 수집 진행):", err);
  }

  // 2. 주가 수집 슬라이스 0 트리거 (유니버스 성패와 무관하게 항상 시작).
  try {
    await triggerNextSlice(getBaseUrl(req), "/api/cron/collect-stocks", { offset: 0 });
    out.stocksTriggered = true;
  } catch (err) {
    out.chainError = String(err);
    console.error("[cron:refresh-universe] 수집 슬라이스 트리거 실패:", err);
  }

  // 계측(§5): 유니버스 갱신 = CollectionRun 1행. itemsOk = 갱신된 유니버스 종목 수(total).
  // 갱신 실패(throw 또는 ok:false)는 itemsFailed=1·error 로 매핑. 집계 자체도 실패 격리.
  try {
    const u = out.universe as { ok?: boolean; total?: number; error?: string } | undefined;
    const failed = Boolean(out.universeError) || u?.ok === false;
    await recordCollectionRun("refresh-universe", startedAt, {
      itemsOk: u?.ok ? u.total ?? 0 : 0,
      itemsFailed: failed ? 1 : 0,
      error: (out.universeError as string | undefined) ?? u?.error ?? null,
    });
  } catch (err) {
    console.error("[cron:refresh-universe] 이력 기록 실패:", err);
  }

  out.runAt = new Date().toISOString();
  return out;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run(req));
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run(req));
}
