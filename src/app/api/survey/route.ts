import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scoreToRiskType } from "@/lib/portfolio";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.riskProfile.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(profile);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { answers }: { answers: number[] } = await req.json();

  if (!answers || answers.length !== 5) {
    return NextResponse.json({ error: "answers must have 5 items" }, { status: 400 });
  }

  const score = answers.reduce((sum, a) => sum + a, 0);
  const riskType = scoreToRiskType(score);

  const profile = await prisma.riskProfile.upsert({
    where: { userId: session.user.id },
    update: { riskType, answers: JSON.stringify(answers) },
    create: { userId: session.user.id, riskType, answers: JSON.stringify(answers) },
  });

  return NextResponse.json(profile);
}
