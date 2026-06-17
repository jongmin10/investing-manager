/**
 * 합성 시드 데이터의 오류를 실제 시장값으로 보정하는 스크립트
 * 실행: node scripts/fix-indicators.mjs
 *
 * 보정 기준일: 2026-06-17
 * 소스: 한국은행, 통계청, BLS, Bloomberg, Yahoo Finance
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const corrections = [
  // ── 기준금리 (이벤트 타입: 실제 금통위·FOMC 결정일 삽입) ──
  // BOK: 1월 동결(2.50%) → 2월 동결 → 4월 동결 → 5월 28일 동결
  { type: 'BOK_BASE_RATE', date: '2026-01-16', value: 2.50 },
  { type: 'BOK_BASE_RATE', date: '2026-02-26', value: 2.50 },
  { type: 'BOK_BASE_RATE', date: '2026-04-10', value: 2.50 },
  { type: 'BOK_BASE_RATE', date: '2026-05-28', value: 2.50 },
  // FED: 6월 17일 동결 (3.50~3.75%, 상단 3.75% 기준)
  { type: 'FED_RATE', date: '2026-06-17', value: 3.75 },

  // ── 국채 금리 (일별 타입: 최근 며칠치 실제값으로 보정) ──
  // 한국 국고채 3년: 실제 ~3.38~3.43% (April), 6월 추정 ~3.30~3.40%
  { type: 'GOV_BOND_3Y', date: '2026-06-13', value: 3.35 },
  { type: 'GOV_BOND_3Y', date: '2026-06-16', value: 3.38 },
  { type: 'GOV_BOND_3Y', date: '2026-06-17', value: 3.40 },
  // 한국 국고채 10년: 실제 ~3.69~3.73% (April), 6월 추정 ~3.65~3.72%
  { type: 'GOV_BOND_10Y', date: '2026-06-13', value: 3.65 },
  { type: 'GOV_BOND_10Y', date: '2026-06-16', value: 3.68 },
  { type: 'GOV_BOND_10Y', date: '2026-06-17', value: 3.70 },
  // 미국 국채 2년: Fed 3.75%와 연동, 실제 ~3.85~3.95%
  { type: 'US_TREASURY_2Y', date: '2026-06-13', value: 3.88 },
  { type: 'US_TREASURY_2Y', date: '2026-06-16', value: 3.90 },
  { type: 'US_TREASURY_2Y', date: '2026-06-17', value: 3.92 },

  // ── 물가 (월별 타입: 실제 발표일로 삽입) ──
  // 미국 CPI 5월: 4.2% YoY (이란 전쟁 에너지 쇼크, 6월 10일 발표)
  { type: 'US_CPI', date: '2026-06-10', value: 4.20 },
  // 미국 PPI 5월: 에너지 급등 반영, 추정 ~4.5%
  { type: 'US_PPI', date: '2026-06-11', value: 4.50 },
  // 한국 CPI 5월: 3.1% YoY (6월 2일 발표)
  { type: 'CPI', date: '2026-06-02', value: 3.10 },
  // 한국 PPI: CPI 선행, 추정 ~2.8%
  { type: 'PPI', date: '2026-06-15', value: 2.80 },

  // ── 고용 (월별 타입) ──
  // 미국 실업률 5월: 4.3% (6월 5일 발표, 비농업 +172K)
  { type: 'US_UNEMPLOYMENT', date: '2026-06-05', value: 4.30 },
  // 한국 실업률: 실제 2.7% (5월 고용통계)
  { type: 'UNEMPLOYMENT', date: '2026-06-19', value: 2.70 },
];

async function run() {
  console.log(`보정 항목: ${corrections.length}개\n`);

  for (const c of corrections) {
    const recordedAt = new Date(`${c.date}T09:00:00+09:00`); // KST 9시 기준

    // 같은 날짜에 이미 레코드가 있으면 삭제 후 삽입 (중복 방지)
    const dayStart = new Date(`${c.date}T00:00:00+09:00`);
    const dayEnd   = new Date(`${c.date}T23:59:59+09:00`);

    const deleted = await prisma.indicatorRecord.deleteMany({
      where: { type: c.type, recordedAt: { gte: dayStart, lte: dayEnd } },
    });

    await prisma.indicatorRecord.create({
      data: { type: c.type, value: c.value, recordedAt },
    });

    const del = deleted.count > 0 ? ` (기존 ${deleted.count}건 대체)` : '';
    console.log(`✓ ${c.type.padEnd(20)} ${c.date}  →  ${c.value}${del}`);
  }

  console.log('\n최신값 확인:');
  const types = [...new Set(corrections.map(c => c.type))];
  for (const type of types) {
    const r = await prisma.indicatorRecord.findFirst({
      where: { type },
      orderBy: { recordedAt: 'desc' },
    });
    if (r) console.log(`  ${type.padEnd(20)} ${String(r.value).padStart(8)}  (${r.recordedAt.toISOString().slice(0, 10)})`);
  }

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
