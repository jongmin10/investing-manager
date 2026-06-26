import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { collectHistoricalData } from "@/lib/collector";
import { isAuthorizedCron } from "@/lib/cron-self";
import { recordCollectionRun } from "@/lib/collection-run";

/**
 * 3년 히스토리 전량 수집 — IndicatorRecord 를 type 별로 deleteMany 후 재삽입한다(파괴적).
 * 무인증 호출 시 누구나 히스토리를 날릴 수 있으므로 cron 인증(Bearer CRON_SECRET) 필수.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 계측(§5): 3년 히스토리 전량 수집 = CollectionRun 1행.
  // itemsOk = 수집 성공한 지표 타입 수, itemsFailed = 실패 타입 수(errors).
  // collectHistoricalData 가 throw 해도 실패 1행을 남기고 응답/throw 동작은 보존한다.
  const startedAt = new Date();
  try {
    const result = await collectHistoricalData();

    if (result.success) {
      revalidatePath("/");
    }

    await recordCollectionRun("history", startedAt, {
      itemsOk: result.summary.length,
      itemsFailed: result.errors.length,
      error: result.errors.length ? result.errors.join("; ") : null,
    }).catch((e) => console.error("[collect/history] 이력 기록 실패:", e));

    return NextResponse.json(result);
  } catch (err) {
    await recordCollectionRun("history", startedAt, {
      itemsOk: 0,
      itemsFailed: 1,
      error: String(err),
    }).catch((e) => console.error("[collect/history] 이력 기록 실패:", e));
    throw err;
  }
}
