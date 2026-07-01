import { NextResponse } from "next/server";
import { getExportMeta } from "@/lib/exports";

// GET /api/exports/meta — 지원 품목군 목록 + firstAvailable + latestConfirmedYm
export async function GET() {
  try {
    const data = await getExportMeta();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[/api/exports/meta]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
