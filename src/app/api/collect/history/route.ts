import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { collectHistoricalData } from "@/lib/collector";

export async function POST() {
  const result = await collectHistoricalData();

  if (result.success) {
    revalidatePath("/");
  }

  return NextResponse.json(result);
}
