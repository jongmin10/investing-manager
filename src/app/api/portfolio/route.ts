import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPortfolioResponse } from "@/lib/portfolio-response";

// 조립 로직은 @/lib/portfolio-response 로 이전 (PUT/DELETE /api/portfolio/target 과 공유).
// 응답 스키마: docs/target-return-etf-recommendation-design.md §6.1

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await buildPortfolioResponse(session.user.id);
  if (!data) return NextResponse.json({ error: "No risk profile" }, { status: 404 });

  return NextResponse.json(data);
}
