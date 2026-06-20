import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const entry = await prisma.journalEntry.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ entry: { ...entry, tickers: entry.tickers ? JSON.parse(entry.tickers) : [] } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.journalEntry.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { date, title, body: text, mood, decisionType, tickers } = body;

  const entry = await prisma.journalEntry.update({
    where: { id },
    data: {
      date:  date ? new Date(date) : existing.date,
      title: title?.trim() ?? existing.title,
      body:  text  ?? existing.body,
      mood:  mood  ?? null,
      decisionType: decisionType ?? null,
      tickers: tickers ? JSON.stringify(tickers) : null,
    },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.journalEntry.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.journalEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
