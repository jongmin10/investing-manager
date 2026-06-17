// 월별 지표 시드 6/15 합성값 → 실제 발표값으로 교체
import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();

const fixes = [
  { type: 'US_CPI',          releaseDate: '2026-06-10', value: 4.20 },
  { type: 'US_PPI',          releaseDate: '2026-06-11', value: 4.50 },
  { type: 'CPI',             releaseDate: '2026-06-02', value: 3.10 },
  { type: 'US_UNEMPLOYMENT', releaseDate: '2026-06-05', value: 4.30 },
];

for (const f of fixes) {
  const day15S = new Date('2026-06-15T00:00:00.000Z');
  const day15E = new Date('2026-06-16T00:00:00.000Z');
  const del = await p.indicatorRecord.deleteMany({
    where: { type: f.type, recordedAt: { gte: day15S, lt: day15E } },
  });

  const releaseDt = new Date(f.releaseDate + 'T00:00:00.000Z');
  const existing = await p.indicatorRecord.findFirst({ where: { type: f.type, recordedAt: releaseDt } });
  if (!existing) {
    await p.indicatorRecord.create({ data: { type: f.type, value: f.value, recordedAt: releaseDt } });
  }

  const latest = await p.indicatorRecord.findFirst({ where: { type: f.type }, orderBy: { recordedAt: 'desc' } });
  console.log(f.type.padEnd(20), '→', latest.value, `(${latest.recordedAt.toISOString().slice(0,10)})`, del.count ? `[6/15 시드 ${del.count}건 제거]` : '');
}

await p.$disconnect();
