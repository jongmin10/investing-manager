/**
 * 2차 지표 보정 스크립트
 * 실행: node scripts/fix-indicators-v2.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();

// ── 1. 삭제할 잘못된 레코드 ────────────────────────────────────────
const toDelete = [
  // BOK 시드가 2026년에 2.75%로 잘못 생성한 레코드
  { type: 'BOK_BASE_RATE', date: '2026-01-11' },
  { type: 'BOK_BASE_RATE', date: '2026-04-11' },
  // 월별 지표 시드의 5월 15일 값 — 실제 April 발표값으로 대체 예정
  { type: 'CPI',           date: '2026-05-15' },
  { type: 'US_CPI',        date: '2026-05-15' },
  { type: 'US_PPI',        date: '2026-05-15' },
  // 미래 날짜 고용 레코드 삭제 (June 19 = 아직 미발표)
  { type: 'UNEMPLOYMENT',  date: '2026-06-19' },
];

// ── 2. 추가할 올바른 레코드 ────────────────────────────────────────
const toAdd = [
  // FED: 5월 6~7일 FOMC 동결 (3.50~3.75% 유지)
  { type: 'FED_RATE', date: '2026-05-07', value: 3.75 },

  // 한국 CPI: 4월(5/2 발표) → 5월(6/2 발표)
  // 이란 전쟁 에너지 쇼크 이전 4월 값
  { type: 'CPI', date: '2026-05-02', value: 2.90 },

  // 한국 PPI: 5월 15일 시드값 2.31% → 실제 4월 발표값으로 교체
  // (May 15 레코드를 더 현실적인 값으로 업데이트)
  { type: 'PPI', date: '2026-05-15', value: 2.45 },

  // 미국 CPI: 4월분(5/13 발표) — 이란 전쟁 초기 영향 반영 ~3.80%
  { type: 'US_CPI', date: '2026-05-13', value: 3.80 },

  // 미국 PPI: 4월분(5/14 발표) — 에너지 가격 상승 초기 ~3.50%
  { type: 'US_PPI', date: '2026-05-14', value: 3.50 },
];

// ── 실행 ──────────────────────────────────────────────────────────
console.log('=== 삭제 ===');
for (const d of toDelete) {
  const dayS = new Date(d.date + 'T00:00:00.000Z');
  const dayE = new Date(d.date + 'T23:59:59.999Z');
  const r = await p.indicatorRecord.deleteMany({
    where: { type: d.type, recordedAt: { gte: dayS, lte: dayE } },
  });
  console.log(`  ${d.type.padEnd(20)} ${d.date} → ${r.count}건 삭제`);
}

console.log('\n=== 추가 ===');
for (const a of toAdd) {
  const dayS = new Date(a.date + 'T00:00:00.000Z');
  const dayE = new Date(a.date + 'T23:59:59.999Z');
  // 같은 날짜 기존 레코드 교체
  const del = await p.indicatorRecord.deleteMany({
    where: { type: a.type, recordedAt: { gte: dayS, lte: dayE } },
  });
  await p.indicatorRecord.create({
    data: { type: a.type, value: a.value, recordedAt: new Date(a.date + 'T00:00:00.000Z') },
  });
  const note = del.count > 0 ? ` (기존 ${del.count}건 대체)` : '';
  console.log(`  ${a.type.padEnd(20)} ${a.date} → ${a.value}${note}`);
}

// ── 결과 확인 ─────────────────────────────────────────────────────
console.log('\n=== 최신값 검증 ===');
const checkTypes = ['BOK_BASE_RATE','FED_RATE','CPI','PPI','US_CPI','US_PPI','UNEMPLOYMENT'];
for (const type of checkTypes) {
  const rows = await p.indicatorRecord.findMany({
    where: { type }, orderBy: { recordedAt: 'desc' }, take: 2,
  });
  const [cur, prev] = rows;
  const chg = prev ? ((cur.value - prev.value) / prev.value * 100).toFixed(2) + '%' : 'N/A';
  console.log(`  ${type.padEnd(20)} ${String(cur.value).padStart(6)} (${cur.recordedAt.toISOString().slice(0,10)}) | prev: ${prev?.value ?? '-'} (${prev?.recordedAt.toISOString().slice(0,10) ?? '-'}) | change: ${chg}`);
}

await p.$disconnect();
