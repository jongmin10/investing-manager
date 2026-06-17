import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();

// US CLI 최근 3개월 보정 (이란 전쟁 에너지 쇼크 반영)
const corrections = [
  { date: '2026-04-15', value: 100.1 },
  { date: '2026-05-15', value: 99.8  },
  { date: '2026-06-15', value: 99.6  },
];

for (const c of corrections) {
  const dayS = new Date(c.date + 'T00:00:00.000Z');
  const dayE = new Date(c.date + 'T23:59:59.999Z');
  await p.indicatorRecord.deleteMany({ where: { type: 'US_CLI', recordedAt: { gte: dayS, lte: dayE } } });
  await p.indicatorRecord.create({ data: { type: 'US_CLI', value: c.value, recordedAt: dayS } });
}

const rows = await p.indicatorRecord.findMany({ where:{type:'US_CLI'}, orderBy:{recordedAt:'desc'}, take:3 });
const [cur, prev] = rows;
console.log(`US_CLI 최신: ${cur.value} (${cur.recordedAt.toISOString().slice(0,10)})`);
console.log(`이전: ${prev.value} → change: ${((cur.value-prev.value)/prev.value*100).toFixed(2)}%`);

await p.$disconnect();
