/**
 * /admin/api-status — 관리자 API 호출 상태 페이지 (서버 컴포넌트)
 *
 * 규격 §3·§7: isAdminEmail 가드 → 미충족 시 notFound()(존재 은닉).
 * 초기 데이터를 서버사이드 Prisma 직접 조회로 가져와 클라이언트 대시보드에 prop 전달.
 * 날짜(DateTime)는 ISO 문자열로 직렬화해 클라이언트 타입과 일관성 유지.
 */

import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import ApiStatusDashboard, {
  type HealthRow,
  type RequestRow,
} from "./ApiStatusDashboard";

export const dynamic = "force-dynamic";

export default async function AdminApiStatusPage() {
  // ── 권한 게이팅 (규격 §3, §8-5 확정: 404 존재 은닉) ──────────────────────
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  // ── 초기 데이터 서버사이드 조회 ───────────────────────────────────────────
  const [healthRaw, requestsRaw] = await Promise.all([
    prisma.externalApiHealth.findMany({ orderBy: { apiKey: "asc" } }),
    prisma.apiRequestLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // DateTime → ISO string 직렬화 (클라이언트 컴포넌트 타입과 일치)
  const health: HealthRow[] = healthRaw.map((h) => ({
    id: h.id,
    apiKey: h.apiKey,
    status: h.status,
    httpStatus: h.httpStatus,
    latencyMs: h.latencyMs,
    lastSuccessAt: h.lastSuccessAt?.toISOString() ?? null,
    lastCheckedAt: h.lastCheckedAt.toISOString(),
    message: h.message,
  }));

  const requests: RequestRow[] = requestsRaw.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    apiKey: r.apiKey,
    method: r.method,
    url: r.url,
    statusCode: r.statusCode,
    responseTimeMs: r.responseTimeMs,
    ok: r.ok,
    error: r.error,
  }));

  return <ApiStatusDashboard initialHealth={health} initialRequests={requests} />;
}
