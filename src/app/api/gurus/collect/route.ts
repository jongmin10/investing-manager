import { NextResponse } from "next/server";
import { collectGuru, GURU_DEFS } from "@/lib/guru-collector";
import { recordCollectionRun } from "@/lib/collection-run";

// Vercel 타임아웃 대응: 대가 1명씩만 처리
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { id?: string };

  if (!body.id) {
    // id 없이 호출 시 전체 id 목록만 반환 (프론트에서 순차 호출)
    // → 실제 수집이 일어나지 않으므로 이력을 남기지 않는다.
    return NextResponse.json({ ids: GURU_DEFS.map((g) => g.id) });
  }

  // 계측(§5): 대가 1명 수집 = CollectionRun 1행.
  // itemsOk = 수집된 보유종목 수(count), 실패 시 itemsFailed=1·error 매핑.
  // collectGuru 가 throw 해도 finally 에서 기록하고 응답/throw 동작은 보존한다.
  const startedAt = new Date();
  const outcome = { itemsOk: 0, itemsFailed: 1, error: null as string | null };
  try {
    const res = await collectGuru(body.id);
    outcome.itemsOk = res.ok ? res.count ?? 0 : 0;
    outcome.itemsFailed = res.ok ? 0 : 1;
    outcome.error = res.ok ? null : res.error ?? null;
    return NextResponse.json(res);
  } catch (err) {
    outcome.error = String(err);
    outcome.itemsFailed = 1;
    throw err;
  } finally {
    // 헬퍼는 내부적으로 실패 격리되지만, 집계 호출 자체도 수집을 죽이지 않도록 격리.
    await recordCollectionRun("gurus", startedAt, outcome).catch((e) =>
      console.error("[gurus/collect] 이력 기록 실패:", e),
    );
  }
}

export async function GET() {
  return NextResponse.json({ ids: GURU_DEFS.map((g) => g.id) });
}
