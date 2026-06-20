import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const dateKey = new Date(date + "T00:00:00.000Z");

  const report = await prisma.marketReport.findUnique({ where: { date: dateKey } });
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ report });
}
