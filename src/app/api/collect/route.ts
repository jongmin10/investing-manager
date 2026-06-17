import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { collectRealtimeData } from "@/lib/collector";

export async function POST() {
  const result = await collectRealtimeData();

  if (result.success) {
    revalidatePath("/");
  }

  return NextResponse.json(result);
}
