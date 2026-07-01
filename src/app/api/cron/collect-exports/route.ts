import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-self";
import { recordCollectionRun } from "@/lib/collection-run";
import { collectExportsRecent } from "@/lib/exports-collector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 품목별 수출 월 확정 갱신 (관세청 GW). daily 오케스트레이터가 매월 확정 창(15~20일)에
 * fire-and-forget 으로 트리거. 최근 3개월 재조회(정정 흡수), provisional=false upsert.
 * 순별(10일 잠정) 실시간 갱신은 데이터셋 확정 후 별도 추가.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date();
  const monthsBack = Number(req.nextUrl.searchParams.get("months") ?? "3");

  const result = await collectExportsRecent(Number.isFinite(monthsBack) ? monthsBack : 3);
  console.log(
    `[cron:exports] 품목군 ${result.itemsOk}/${result.itemsOk + result.itemsFailed} 갱신, ${result.rowsUpserted}행`
  );

  await recordCollectionRun("exports", startedAt, {
    itemsOk: result.itemsOk,
    itemsFailed: result.itemsFailed,
    error: result.failed.length ? result.failed.map((f) => `${f.code}:${f.error}`).join("; ") : null,
  }).catch((e) => console.error("[cron:exports] 이력 기록 실패:", e));

  return NextResponse.json({ ok: true, runAt: new Date().toISOString(), result });
}

// daily 오케스트레이터는 triggerNextSlice(POST)로 던진다 → GET 과 동일 처리.
export async function POST(req: NextRequest) {
  return GET(req);
}
