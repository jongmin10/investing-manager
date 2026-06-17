import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ECONOMIC_EVENTS, getDaysUntil } from "@/lib/calendar";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let favoriteKeys: Set<string> = new Set();
  if (userId) {
    const favorites = await prisma.favoriteEvent.findMany({
      where: { userId },
      select: { eventKey: true },
    });
    favoriteKeys = new Set(favorites.map((f) => f.eventKey));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = ECONOMIC_EVENTS.map((event) => ({
    ...event,
    daysUntil: getDaysUntil(event.date),
    isPast: new Date(event.date) < today,
    isFavorite: favoriteKeys.has(event.key),
  })).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(events);
}
