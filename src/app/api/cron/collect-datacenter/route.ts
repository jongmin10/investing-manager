import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-self";
import { recordCollectionRun } from "@/lib/collection-run";
import {
  collectEDGARCapex,
  collectEIAPower,
  collectDCMapCounts,
  collectSdllmtk,
} from "@/lib/datacenter-collector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 데이터센터 지표 일별 수집.
 * daily 오케스트레이터가 fire-and-forget 으로 트리거.
 *
 * ① EDGAR Capex (4사, ~15s)
 * ② EIA 버지니아 전력 수요 (~2s)
 * ③ datacentermap 12개국 DC 카운트 (~12s)
 * ④ Silicon Data SDLLMTK (~2s)
 * 합산 ~33s → maxDuration 60s 여유 있음
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  let itemsOk = 0;
  let itemsFailed = 0;
  const errors: string[] = [];

  // ① EDGAR Capex
  try {
    const r = await collectEDGARCapex();
    itemsOk += r.ok;
    itemsFailed += r.failed.length;
    if (r.failed.length) errors.push(...r.failed);
    console.log(`[dc] EDGAR Capex: ${r.ok}건, 실패 ${r.failed.length}건`);
  } catch (e) {
    itemsFailed++;
    errors.push(`EDGAR: ${(e as Error).message}`);
    console.error("[dc] EDGAR Capex 수집 오류:", e);
  }

  // ② EIA 전력
  try {
    const r = await collectEIAPower();
    itemsOk += r.ok;
    itemsFailed += r.failed.length;
    if (r.failed.length) errors.push(...r.failed);
    console.log(`[dc] EIA 전력: ${r.ok}건, 실패 ${r.failed.length}건`);
  } catch (e) {
    itemsFailed++;
    errors.push(`EIA: ${(e as Error).message}`);
    console.error("[dc] EIA 전력 수집 오류:", e);
  }

  // ③ datacentermap DC 카운트
  try {
    const r = await collectDCMapCounts();
    itemsOk += r.ok;
    itemsFailed += r.failed.length;
    if (r.failed.length) errors.push(...r.failed);
    console.log(`[dc] DCMAP: ${r.ok}개국, 실패 ${r.failed.length}개국`);
  } catch (e) {
    itemsFailed++;
    errors.push(`DCMAP: ${(e as Error).message}`);
    console.error("[dc] DCMAP 수집 오류:", e);
  }

  // ④ Silicon Data SDLLMTK (LLM 토큰 지출 지수)
  try {
    const r = await collectSdllmtk();
    itemsOk += r.ok;
    itemsFailed += r.failed.length;
    if (r.failed.length) errors.push(...r.failed.map((e) => `SDLLMTK: ${e}`));
    console.log(`[dc] SDLLMTK: ${r.ok}건, 실패 ${r.failed.length}건`);
  } catch (e) {
    itemsFailed++;
    errors.push(`SDLLMTK: ${(e as Error).message}`);
    console.error("[dc] SDLLMTK 수집 오류:", e);
  }

  await recordCollectionRun("datacenter", startedAt, {
    itemsOk,
    itemsFailed,
    error: errors.length ? errors.join("; ").slice(0, 1000) : null,
  }).catch((e) => console.error("[dc] 이력 기록 실패:", e));

  return NextResponse.json({
    ok: true,
    runAt: new Date().toISOString(),
    itemsOk,
    itemsFailed,
    errors,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
