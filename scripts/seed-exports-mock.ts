/**
 * ⚠️ 임시 목(mock) 데이터 — UI 렌더 검증 전용. 실제 관세청 데이터 아님.
 * 검증 후 반드시 삭제: npx tsx scripts/seed-exports-mock.ts --clear
 * (MonthlyExport 테이블은 실 수집 전이라 비어 있으므로 deleteMany 안전.)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE: Record<string, { name: string; expEok: number; impRatio: number }> = {
  SEMICON: { name: "반도체", expEok: 110, impRatio: 0.35 },
  AUTO: { name: "자동차", expEok: 55, impRatio: 0.2 },
  MACHINE: { name: "일반기계", expEok: 45, impRatio: 0.7 },
  OIL_PROD: { name: "석유제품", expEok: 40, impRatio: 1.3 },
  PETROCHEM: { name: "석유화학", expEok: 35, impRatio: 0.6 },
  STEEL: { name: "철강", expEok: 28, impRatio: 0.8 },
  SHIP: { name: "선박", expEok: 20, impRatio: 0.1 },
  AUTO_PARTS: { name: "자동차부품", expEok: 19, impRatio: 0.5 },
  DISPLAY: { name: "디스플레이", expEok: 15, impRatio: 0.4 },
  WIRELESS: { name: "무선통신기기", expEok: 13, impRatio: 0.7 },
  BIO: { name: "바이오헬스", expEok: 12, impRatio: 0.6 },
  COMPUTER: { name: "컴퓨터", expEok: 12, impRatio: 0.9 },
  TEXTILE: { name: "섬유류", expEok: 10, impRatio: 0.8 },
  BATTERY: { name: "이차전지", expEok: 8, impRatio: 0.5 },
  HOME_APPL: { name: "가전", expEok: 6, impRatio: 0.7 },
  ETC: { name: "기타", expEok: 150, impRatio: 0.9 },
};

const EOK = 1e8; // 1억 달러

function ymList(fromY: number, fromM: number, toY: number, toM: number): string[] {
  const out: string[] = [];
  let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function clear() {
  const { count } = await prisma.monthlyExport.deleteMany({});
  console.log(`MonthlyExport ${count}행 삭제(목 데이터 정리 완료).`);
}

async function seed() {
  const months = ymList(2021, 1, 2026, 6); // 확정 구간
  const rows: {
    itemCode: string; itemName: string; yearMonth: string;
    exportUsd: bigint; importUsd: bigint; provisional: boolean; periodLabel: string | null;
  }[] = [];

  for (const [code, b] of Object.entries(BASE)) {
    months.forEach((ym, i) => {
      const [, mm] = ym.split("-").map(Number);
      const trend = 1 + i * 0.004;                        // 완만한 우상향
      const season = 1 + 0.12 * Math.sin((mm / 12) * 2 * Math.PI); // 계절성
      const noise = 0.9 + ((i * 7 + code.length * 13) % 20) / 100;  // ±10% 결정적 노이즈
      const exp = b.expEok * EOK * trend * season * noise;
      rows.push({
        itemCode: code, itemName: b.name, yearMonth: ym,
        exportUsd: BigInt(Math.round(exp)),
        importUsd: BigInt(Math.round(exp * b.impRatio)),
        provisional: false, periodLabel: null,
      });
    });
  }

  // 당월(2026-07) 순별 잠정 — 주요 3품목만(1~20일 누적 ≈ 65%)
  for (const code of ["SEMICON", "AUTO", "OIL_PROD"]) {
    const b = BASE[code];
    rows.push({
      itemCode: code, itemName: b.name, yearMonth: "2026-07",
      exportUsd: BigInt(Math.round(b.expEok * EOK * 1.1 * 0.65)),
      importUsd: BigInt(Math.round(b.expEok * EOK * b.impRatio * 0.65)),
      provisional: true, periodLabel: "1~20일",
    });
  }

  const BATCH = 20;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map((r) =>
        prisma.monthlyExport.upsert({
          where: { itemCode_yearMonth: { itemCode: r.itemCode, yearMonth: r.yearMonth } },
          create: r, update: r,
        })
      )
    );
  }
  console.log(`목 데이터 ${rows.length}행 시드 완료 (2021-01~2026-06 확정 + 2026-07 잠정 3품목).`);
}

async function main() {
  if (process.argv.includes("--clear")) await clear();
  else await seed();
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
