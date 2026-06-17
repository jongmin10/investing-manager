import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { INDICATORS, IndicatorType } from "@/lib/indicators";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, history] = await Promise.all([
    prisma.alertSetting.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alertHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { sentAt: "desc" },
      take: 20,
    }),
  ]);

  // Attach current indicator values to each setting
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

  const settingsWithMeta = settings.map((s) => ({
    ...s,
    currentValue: currentValues[s.indicatorType] ?? null,
    indicatorName: INDICATORS[s.indicatorType as IndicatorType]?.name ?? s.indicatorType,
    unit: INDICATORS[s.indicatorType as IndicatorType]?.unit ?? "",
    isTriggered:
      s.direction === "ABOVE"
        ? (currentValues[s.indicatorType] ?? 0) >= s.threshold
        : (currentValues[s.indicatorType] ?? 0) <= s.threshold,
  }));

  return NextResponse.json({ settings: settingsWithMeta, history });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { indicatorType, threshold, direction, channel } = body as {
    indicatorType: string;
    threshold: number;
    direction: "ABOVE" | "BELOW";
    channel: "EMAIL" | "PUSH";
  };

  if (!indicatorType || threshold == null || !direction || !channel) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!INDICATORS[indicatorType as IndicatorType]) {
    return NextResponse.json({ error: "Invalid indicator type" }, { status: 400 });
  }

  const setting = await prisma.alertSetting.create({
    data: {
      userId: session.user.id,
      indicatorType,
      threshold,
      direction,
      channel,
    },
  });

  return NextResponse.json(setting, { status: 201 });
}
