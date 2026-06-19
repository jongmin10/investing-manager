import { NextResponse } from "next/server";
import { getCollectStatus } from "@/lib/stock-collector";

export async function GET() {
  const status = await getCollectStatus();
  return NextResponse.json(status);
}
