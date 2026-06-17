/**
 * 미국 경기선행지수(US_CLI) 3년치 월별 데이터 생성
 * 실행: node scripts/seed-us-cli.mjs
 *
 * 실제 OECD US CLI 흐름 참고 (2023-2026):
 *  - 2023 H1: ~99.5 (2022 침체 이후 완만한 회복)
 *  - 2024 H2: ~101.0~101.5 (AI 호황, 소비 강세)
 *  - 2025 H2: ~101.5 (확장 정점)
 *  - 2026 H1: ~100.0→99.8 (이란 전쟁 에너지 쇼크, 성장 둔화)
 */
import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();

function randn() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// 곡선 목표값: 삼각형 상승 후 하강
function targetAt(progress) {
  // progress: 0(2023-06) → 1(2026-06)
  if (progress < 0.5) {
    // 상승: 99.5 → 101.5
    return 99.5 + 2.0 * (progress / 0.5);
  } else {
    // 하강: 101.5 → 99.8
    return 101.5 - 1.7 * ((progress - 0.5) / 0.5);
  }
}

// 월별 날짜 생성 (매월 15일)
const today = new Date();
const from  = new Date(today);
from.setFullYear(from.getFullYear() - 3);
from.setDate(15);

const dates = [];
const cursor = new Date(from);
while (cursor <= today) {
  dates.push(new Date(cursor));
  cursor.setMonth(cursor.getMonth() + 1);
}

const n = dates.length;
let value = 99.5; // 시작값

const records = dates.map((date, i) => {
  const progress  = i / Math.max(n - 1, 1);
  const target    = targetAt(progress);
  const REVERSION = 0.2;
  const VOLATILITY = 0.25;

  value = value + REVERSION * (target - value) + VOLATILITY * randn();
  value = Math.max(97, Math.min(104, value));

  return { type: 'US_CLI', value: parseFloat(value.toFixed(1)), recordedAt: date };
});

// 기존 US_CLI 데이터 전체 교체
await p.indicatorRecord.deleteMany({ where: { type: 'US_CLI' } });
await p.indicatorRecord.createMany({ data: records });

// 최신 2개 확인
const latest = await p.indicatorRecord.findMany({
  where: { type: 'US_CLI' }, orderBy: { recordedAt: 'desc' }, take: 3,
});

console.log(`✓ US_CLI: ${records.length}개 레코드 생성`);
console.log('최근 3개월:');
latest.forEach(r => console.log(`  ${r.recordedAt.toISOString().slice(0,10)} = ${r.value}`));

await p.$disconnect();
