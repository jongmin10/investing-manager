import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Simulates checking alert thresholds against current indicator values
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.alertSetting.findMany({
    where: { userId: session.user.id, isActive: true },
  });

  if (settings.length === 0) return NextResponse.json({ triggered: [] });

  const types = [...new Set(settings.map((s) => s.indicatorType))];
  const latestRecords = await Promise.all(
    types.map((type) =>
      prisma.indicatorRecord.findFirst({
        where: { type },
        orderBy: { recordedAt: "desc" },
      })
    )
  );
  const currentValues: Record<string, number> = {};
  types.forEach((type, i) => {
    currentValues[type] = latestRecords[i]?.value ?? 0;
  });

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const triggered = [];

  for (const setting of settings) {
    const current = currentValues[setting.indicatorType] ?? 0;
    const isTriggered =
      setting.direction === "ABOVE" ? current >= setting.threshold : current <= setting.threshold;

    if (!isTriggered) continue;

    // Deduplicate: skip if already triggered within last hour
    const recent = await prisma.alertHistory.findFirst({
      where: {
        userId: session.user.id,
        indicatorType: setting.indicatorType,
        direction: setting.direction,
        sentAt: { gte: oneHourAgo },
      },
    });
    if (recent) continue;

    const history = await prisma.alertHistory.create({
      data: {
        userId: session.user.id,
        indicatorType: setting.indicatorType,
        value: current,
        threshold: setting.threshold,
        direction: setting.direction,
        channel: setting.channel,
      },
    });
    triggered.push(history);
  }

  return NextResponse.json({ triggered });
}
