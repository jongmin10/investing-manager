import { NextResponse } from "next/server";
import { collectGuru, GURU_DEFS } from "@/lib/guru-collector";

// Vercel 타임아웃 대응: 대가 1명씩만 처리
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { id?: string };

  if (!body.id) {
    // id 없이 호출 시 전체 id 목록만 반환 (프론트에서 순차 호출)
    return NextResponse.json({ ids: GURU_DEFS.map((g) => g.id) });
  }

  const res = await collectGuru(body.id);
  return NextResponse.json(res);
}

export async function GET() {
  return NextResponse.json({ ids: GURU_DEFS.map((g) => g.id) });
}
