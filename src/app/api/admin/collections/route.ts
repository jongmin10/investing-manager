import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { COLLECTION_JOBS } from "@/lib/collection-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 각 잡의 마지막 실행 1건씩 병렬 조회
  const lastRuns = await Promise.all(
    COLLECTION_JOBS.map((j) =>
      prisma.collectionRun.findFirst({
        where: { job: j.id },
        orderBy: { startedAt: "desc" },
      }),
    ),
  );

  const rows = COLLECTION_JOBS.map((job, i) => {
    const run = lastRuns[i];
    return {
      id: job.id,
      name: job.name,
      url: job.url,
      schedule: job.schedule,
      trigger: job.trigger,
      description: job.description,
      lastRun: run
        ? {
            status: run.status,
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt.toISOString(),
            durationMs: run.durationMs,
            itemsOk: run.itemsOk,
            itemsFailed: run.itemsFailed,
            error: run.error,
          }
        : null,
    };
  });

  return NextResponse.json(rows);
}
