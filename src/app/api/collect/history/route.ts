import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { collectHistoricalData } from "@/lib/collector";
import { isAuthorizedCron } from "@/lib/cron-self";

/**
 * 3년 히스토리 전량 수집 — IndicatorRecord 를 type 별로 deleteMany 후 재삽입한다(파괴적).
 * 무인증 호출 시 누구나 히스토리를 날릴 수 있으므로 cron 인증(Bearer CRON_SECRET) 필수.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await collectHistoricalData();

  if (result.success) {
    revalidatePath("/");
  }

  return NextResponse.json(result);
}
