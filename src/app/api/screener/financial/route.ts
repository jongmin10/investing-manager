import { NextResponse } from "next/server";
import { collectAllFinancials, getFinancialStatus } from "@/lib/dart-collector";

let collecting = false;

export async function POST() {
  if (!process.env.DART_API_KEY) {
    return NextResponse.json(
      {
        error: "DART_API_KEY가 설정되지 않았습니다.",
        guide: [
          "1. https://opendart.fss.or.kr 에서 API 키 발급",
          "2. .env 파일에 DART_API_KEY=발급받은키 추가",
          "3. 서버 재시작 후 node scripts/fetch-dart-corp-codes.mjs 실행",
          "4. 다시 수집 요청",
        ],
      },
      { status: 400 }
    );
  }

  if (collecting) {
    return NextResponse.json(
      { error: "재무 데이터 수집 중입니다. 완료 후 다시 시도하세요." },
      { status: 429 }
    );
  }

  collecting = true;
  try {
    const result = await collectAllFinancials();
    return NextResponse.json({
      ...result,
      message: result.noDartCode > 0
        ? `${result.updated}개 수집 완료 / ${result.noDartCode}개는 DART 코드 미매핑 (scripts/fetch-dart-corp-codes.mjs 실행 필요)`
        : `${result.updated}개 수집 완료`,
    });
  } finally {
    collecting = false;
  }
}

export async function GET() {
  const status = await getFinancialStatus();
  return NextResponse.json({ collecting, ...status });
}
