import { NextResponse } from "next/server";
import { collectAllGurus, collectGuru } from "@/lib/guru-collector";

let collecting = false;

export async function POST(req: Request) {
  if (collecting) return NextResponse.json({ error: "수집 중입니다." }, { status: 429 });

  const body = await req.json().catch(() => ({})) as { id?: string };
  collecting = true;
  try {
    if (body.id) {
      const res = await collectGuru(body.id);
      return NextResponse.json(res);
    }
    const results = await collectAllGurus();
    const ok = results.filter((r) => r.ok).length;
    return NextResponse.json({ results, collected: ok, total: results.length });
  } finally {
    collecting = false;
  }
}

export async function GET() {
  return NextResponse.json({ collecting });
}
