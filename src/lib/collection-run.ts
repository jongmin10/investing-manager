import { prisma } from "@/lib/prisma";

/**
 * 수집 작업 실행 이력(CollectionRun) 기록 헬퍼 (규격 §5·§7).
 *
 * 설계 원칙:
 * - 계측이 수집을 죽이면 안 된다 → 모든 쓰기를 try/catch 로 격리(실패 시 로그만).
 * - error 문자열은 과도한 길이로 DB 를 부풀리지 않도록 truncate.
 * - 슬라이스/self-chaining 수집(stocks·financials)은 "잡 단위 집계 1행"(§8-1 확정)
 *   정책을 호출부에서 구현한다 — 누산기를 슬라이스 본문으로 넘기고 마지막 슬라이스에서
 *   1행만 기록. 이 헬퍼는 단일 행 append 만 담당한다.
 * - 보존(§8-3): 매 기록 시 30일 초과 행을 best-effort 정리(별도 cron 불필요).
 */

export type CollectionJob =
  | "stocks"
  | "financials"
  | "gurus"
  | "daily"
  | "refresh-universe"
  | "history"
  | "exports";

export type RunStatus = "success" | "failed" | "partial";

export interface RunOutcome {
  /** 명시하지 않으면 itemsFailed/error 로부터 자동 추론한다. */
  status?: RunStatus;
  itemsOk?: number;
  itemsFailed?: number;
  error?: string | null;
}

const MAX_ERROR_LEN = 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30일

function deriveStatus(o: RunOutcome): RunStatus {
  if (o.status) return o.status;
  const ok = o.itemsOk ?? 0;
  const failed = o.itemsFailed ?? 0;
  if (o.error) return ok > 0 ? "partial" : "failed";
  if (failed > 0) return ok > 0 ? "partial" : "failed";
  return "success";
}

/** CollectionRun 1행을 기록한다(실행당 1행 append). 실패는 삼키고 로그만 남긴다. */
export async function recordCollectionRun(
  job: CollectionJob,
  startedAt: Date,
  outcome: RunOutcome,
): Promise<void> {
  const finishedAt = new Date();
  try {
    await prisma.collectionRun.create({
      data: {
        job,
        status: deriveStatus(outcome),
        itemsOk: outcome.itemsOk ?? 0,
        itemsFailed: outcome.itemsFailed ?? 0,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: outcome.error ? outcome.error.slice(0, MAX_ERROR_LEN) : null,
        startedAt,
        finishedAt,
      },
    });
  } catch (err) {
    console.error(`[collection-run] 이력 기록 실패 job=${job}:`, err);
    return; // 정리까지 시도하지 않고 종료
  }

  // 보존 정책: 30일 초과 행 정리(best-effort, 단일 indexed delete — 비용 낮음).
  try {
    await prisma.collectionRun.deleteMany({
      where: { finishedAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  } catch (err) {
    console.error("[collection-run] 보존 정리 실패:", err);
  }
}
