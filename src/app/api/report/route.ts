import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReport } from "@/lib/report-generator";

let generating = false;

// 최근 리포트 목록
export async function GET() {
  const reports = await prisma.marketReport.findMany({
    orderBy: { date: "desc" },
    take: 30,
    select: { id: true, date: true, status: true, generatedAt: true,
              kospi: true, kospiChange: true, sp500: true, sp500Change: true },
  });
  return NextResponse.json({ reports });
}

// 오늘 리포트 생성 (force=true 시 기존 리포트 덮어쓰기)
export async function POST(req: Request) {
  if (generating) return NextResponse.json({ error: "생성 중입니다." }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { force?: boolean };
  generating = true;
  try {
    const report = await generateReport(undefined, { force: body.force ?? true });
    return NextResponse.json({ report });
  } finally {
    generating = false;
  }
}
