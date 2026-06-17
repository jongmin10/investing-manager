import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const types = [
  'BOK_BASE_RATE', 'GOV_BOND_3Y', 'GOV_BOND_10Y',
  'FED_RATE', 'US_TREASURY_2Y', 'US_TREASURY_10Y',
  'KOSPI', 'KOSDAQ', 'SP500', 'NASDAQ100', 'SOX',
  'CPI', 'PPI', 'KRW_USD', 'CLI', 'UNEMPLOYMENT',
  'US_CPI', 'US_PPI', 'US_UNEMPLOYMENT',
  'VIX', 'FEAR_GREED',
];

for (const type of types) {
  const r = await prisma.indicatorRecord.findFirst({
    where: { type },
    orderBy: { recordedAt: 'desc' },
  });
  if (r) {
    console.log(type.padEnd(22), String(r.value.toFixed(2)).padStart(10), '  ', r.recordedAt.toISOString().slice(0, 10));
  } else {
    console.log(type.padEnd(22), '      N/A');
  }
}

await prisma.$disconnect();
