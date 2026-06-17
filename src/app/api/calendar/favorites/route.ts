import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ECONOMIC_EVENTS } from "@/lib/calendar";

const validKeys = new Set(ECONOMIC_EVENTS.map((e) => e.key));

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventKey } = await req.json();
  if (!validKeys.has(eventKey)) {
    return NextResponse.json({ error: "Invalid event key" }, { status: 400 });
  }

  await prisma.favoriteEvent.upsert({
    where: { userId_eventKey: { userId: session.user.id, eventKey } },
    update: {},
    create: { userId: session.user.id, eventKey },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventKey } = await req.json();

  await prisma.favoriteEvent.deleteMany({
    where: { userId: session.user.id, eventKey },
  });

  return NextResponse.json({ ok: true });
}
