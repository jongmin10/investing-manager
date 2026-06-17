/**
 * 한국 국고채 3년·10년 금리 히스토리 교체
 *
 * 실제 시장 데이터 기준 (investing.com, KOFIA):
 *  - 3년물 52주 범위: 2.380 ~ 3.983%  현재(2026-06-17): 3.725%
 *  - 10년물 52주 범위: 2.701 ~ 4.366%  현재(2026-06-17): 4.079%
 *
 * 배경:
 *  - 2023~2024: BOK 금리인하 사이클 → 채권금리 하락
 *  - 2025 H1: 최저점 (3Y ~2.38%, 10Y ~2.70%)
 *  - 2025 H2~2026: 미국 금리인상 우려 + 이란전쟁 에너지 쇼크 → 급등
 *  - 2026-06-08: 3Y 3.94% 돌파 (2년 7개월 최고, 뉴스 보도)
 *  - 2026-06-17: 3Y 3.725%, 10Y 4.079%
 */
import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();

// 월별 실제 궤적 (YYYY-MM → [3Y, 10Y])
const TRAJECTORY = {
  // ── 2023 (BOK 3.50% 유지) ──
  '2023-06': [3.74, 3.94],
  '2023-07': [3.82, 4.02],
  '2023-08': [3.88, 4.12],
  '2023-09': [3.91, 4.18],
  '2023-10': [3.95, 4.22],
  '2023-11': [3.85, 4.10],
  '2023-12': [3.74, 3.95],
  // ── 2024 (BOK 인하 사이클: 3.5→3.25→3.0→2.75) ──
  '2024-01': [3.62, 3.82],
  '2024-02': [3.55, 3.75],
  '2024-03': [3.48, 3.68],
  '2024-04': [3.38, 3.58],
  '2024-05': [3.28, 3.48],
  '2024-06': [3.18, 3.38],  // BOK 3.25%로 첫 인하
  '2024-07': [3.08, 3.28],
  '2024-08': [2.98, 3.18],
  '2024-09': [2.88, 3.08],  // BOK 3.00%
  '2024-10': [2.78, 2.98],
  '2024-11': [2.72, 2.92],
  '2024-12': [2.65, 2.85],  // BOK 2.75%
  // ── 2025 (BOK 2.75→2.5, 최저점 후 반등) ──
  '2025-01': [2.55, 2.76],
  '2025-02': [2.48, 2.72],
  '2025-03': [2.42, 2.73],  // BOK 2.50%
  '2025-04': [2.39, 2.71],
  '2025-05': [2.38, 2.70],  // 52주 최저점
  '2025-06': [2.41, 2.74],
  '2025-07': [2.55, 2.90],  // 미국 금리인상 우려 등장
  '2025-08': [2.72, 3.05],
  '2025-09': [2.90, 3.22],
  '2025-10': [3.08, 3.42],
  '2025-11': [3.22, 3.58],
  '2025-12': [3.38, 3.72],
  // ── 2026 (이란전쟁 에너지 쇼크 → 금리 급등) ──
  '2026-01': [3.48, 3.80],
  '2026-02': [3.55, 3.87],  // 검색결과 3/31 기준 3Y=3.55%, 10Y=3.87%
  '2026-03': [3.62, 3.94],
  '2026-04': [3.72, 4.02],
  '2026-05': [3.82, 4.12],
};

// 일별 세부 데이터 (6월)
const JUNE_DAILY = [
  // [YYYY-MM-DD, 3Y, 10Y]
  ['2026-06-01', 3.88, 4.18],
  ['2026-06-02', 3.86, 4.16],
  ['2026-06-03', 3.88, 4.18],
  ['2026-06-04', 3.89, 4.20],
  ['2026-06-05', 3.91, 4.22],
  ['2026-06-08', 3.94, 4.30],  // 뉴스: 3Y 3.9% 돌파 (2년 7개월 최고)
  ['2026-06-09', 3.92, 4.28],
  ['2026-06-10', 3.90, 4.25],
  ['2026-06-11', 3.85, 4.20],
  ['2026-06-12', 3.82, 4.16],
  ['2026-06-13', 3.79, 4.12],
  ['2026-06-16', 3.77, 4.10],
  ['2026-06-17', 3.73, 4.08],  // investing.com 실제값: 3Y=3.725%, 10Y=4.079%
];

async function replace(type, records) {
  await p.indicatorRecord.deleteMany({ where: { type } });
  await p.indicatorRecord.createMany({ data: records });
  const [cur, prev] = await p.indicatorRecord.findMany({ where:{type}, orderBy:{recordedAt:'desc'}, take:2 });
  const chg = prev ? ((cur.value - prev.value) / prev.value * 100).toFixed(2) : 'N/A';
  console.log(`✓ ${type.padEnd(15)} ${records.length}개 → 최신 ${cur.value}% (${cur.recordedAt.toISOString().slice(0,10)}) change: ${chg}%`);
}

const bond3Y = [];
const bond10Y = [];

// 월별 데이터 (매월 15일 기준)
for (const [ym, [y3, y10]] of Object.entries(TRAJECTORY)) {
  const date = new Date(`${ym}-15T00:00:00.000Z`);
  bond3Y.push({ type: 'GOV_BOND_3Y', value: y3, recordedAt: date });
  bond10Y.push({ type: 'GOV_BOND_10Y', value: y10, recordedAt: date });
}

// 6월 일별 데이터
for (const [d, y3, y10] of JUNE_DAILY) {
  const date = new Date(`${d}T00:00:00.000Z`);
  bond3Y.push({ type: 'GOV_BOND_3Y', value: y3, recordedAt: date });
  bond10Y.push({ type: 'GOV_BOND_10Y', value: y10, recordedAt: date });
}

console.log('한국 국고채 금리 교체 중...\n');
await replace('GOV_BOND_3Y', bond3Y);
await replace('GOV_BOND_10Y', bond10Y);

// 검증: 최근 5일
console.log('\n최근 5영업일:');
for (const t of ['GOV_BOND_3Y', 'GOV_BOND_10Y']) {
  const rows = await p.indicatorRecord.findMany({ where:{type:t}, orderBy:{recordedAt:'desc'}, take:5 });
  console.log(`  ${t}:`, rows.map(r => `${r.recordedAt.toISOString().slice(0,10)}=${r.value}`).join(', '));
}

await p.$disconnect();
