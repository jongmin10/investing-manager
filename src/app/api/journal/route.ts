import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.journalEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    select: {
      id: true, date: true, title: true, mood: true,
      decisionType: true, tickers: true, createdAt: true,
    },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, title, body: text, mood, decisionType, tickers,
          snapshotKospi, snapshotSp500, snapshotKrwUsd, snapshotUs10y } = body;

  if (!title?.trim() || !date) {
    return NextResponse.json({ error: "날짜와 제목은 필수입니다." }, { status: 400 });
  }

  const entry = await prisma.journalEntry.create({
    data: {
      userId: session.user.id,
      date:   new Date(date),
      title:  title.trim(),
      body:   text ?? "",
      mood:   mood   || null,
      decisionType: decisionType || null,
      tickers: tickers ? JSON.stringify(tickers) : null,
      snapshotKospi:  snapshotKospi  ?? null,
      snapshotSp500:  snapshotSp500  ?? null,
      snapshotKrwUsd: snapshotKrwUsd ?? null,
      snapshotUs10y:  snapshotUs10y  ?? null,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
