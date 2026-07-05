import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function getOwned(id: string, userId: string) {
  const holding = await prisma.portfolioHolding.findUnique({ where: { id } });
  if (!holding || holding.userId !== userId) return null;
  return holding;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const holding = await getOwned(id, session.user.id);
  if (!holding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const weight = body.weight !== undefined ? parseFloat(body.weight) : undefined;
  const purchaseDate = body.purchaseDate as string | undefined;

  if (weight !== undefined && (isNaN(weight) || weight <= 0 || weight > 100)) {
    return NextResponse.json({ error: "Invalid weight" }, { status: 400 });
  }

  const updated = await prisma.portfolioHolding.update({
    where: { id },
    data: {
      ...(weight !== undefined && { weight }),
      ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const holding = await getOwned(id, session.user.id);
  if (!holding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.portfolioHolding.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
