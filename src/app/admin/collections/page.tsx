import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { COLLECTION_JOBS } from "@/lib/collection-registry";
import CollectionsPanel, { type CollectionRow } from "./CollectionsPanel";

export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const lastRuns = await Promise.all(
    COLLECTION_JOBS.map((j) =>
      prisma.collectionRun.findFirst({
        where: { job: j.id },
        orderBy: { startedAt: "desc" },
      }),
    ),
  );

  const rows: CollectionRow[] = COLLECTION_JOBS.map((job, i) => {
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

  return <CollectionsPanel initialRows={rows} />;
}
