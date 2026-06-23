/**
 * ETF 누적수익률 시드 (H5/L — src/lib/portfolio.ts 상수 E → DB 이전)
 *
 * - 값은 기존 상수 E와 1:1 동일 (임의 변경 금지).
 * - 출처/기준일: 코드 주석 기준 2026-06.
 * - updateMethod:
 *     INDEX_CAGR → KOSPI200/SP500/NASDAQ100. IndicatorRecord(KOSPI/SP500/NASDAQ100) 3년
 *                  히스토리로 CAGR 자동 산출·갱신 가능. (collector 연동 경로: scripts/recalc-etf-returns.mjs)
 *     MANUAL     → 국채3년/미국30년국채H/TDF2030/혼합국채. 대응 지수 미수집 → 수동 시드값 유지.
 *
 * 멱등(upsert by key). IndicatorRecord 등 다른 테이블은 절대 건드리지 않는다.
 * 실행: npx tsx prisma/seed-etf.ts   (또는 npm run db:seed:etf)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 기준일: 2026-06 (상수 E 주석 기준). 값은 상수 E와 동일.
const AS_OF = new Date("2026-06-15T00:00:00.000Z");

type EtfReturnSeed = {
  key: string;
  ticker: string;
  name: string;
  cumulativeReturn: number;
  returnYears: number;
  returnPeriod: string;
  source: string;
  updateMethod: "INDEX_CAGR" | "MANUAL";
  indexType: string | null;
};

const SEED: EtfReturnSeed[] = [
  // ── 지수 수집 대상 (INDEX_CAGR) ──────────────────────────
  {
    key: "KOSPI200", ticker: "069500", name: "KODEX 200",
    cumulativeReturn: 315, returnYears: 10, returnPeriod: "10년",
    source: "KOSPI200 지수 성과 (기준일 2026-06, 지수 기반 추정)",
    updateMethod: "INDEX_CAGR", indexType: "KOSPI",
  },
  {
    key: "SP500", ticker: "360750", name: "TIGER 미국S&P500",
    cumulativeReturn: 198, returnYears: 6, returnPeriod: "6년 (설정이후)",
    source: "S&P500 지수 성과 + KRW/USD 반영 (기준일 2026-06, 지수 기반 추정)",
    updateMethod: "INDEX_CAGR", indexType: "SP500",
  },
  {
    key: "NASDAQ100", ticker: "133690", name: "TIGER 나스닥100",
    cumulativeReturn: 612, returnYears: 10, returnPeriod: "10년",
    source: "NASDAQ100 지수 성과 + KRW/USD 반영 (기준일 2026-06, 지수 기반 추정)",
    updateMethod: "INDEX_CAGR", indexType: "NASDAQ100",
  },
  // ── 지수 미수집 (MANUAL) ─────────────────────────────────
  {
    key: "국채3년", ticker: "114260", name: "TIGER 국채3년",
    cumulativeReturn: 31, returnYears: 10, returnPeriod: "10년",
    source: "국내 3년 국고채 성과 (기준일 2026-06, 수동 추정)",
    updateMethod: "MANUAL", indexType: null,
  },
  {
    key: "미국30년국채H", ticker: "304660", name: "ACE 미국30년국채(H)",
    cumulativeReturn: 22, returnYears: 8, returnPeriod: "8년 (설정이후)",
    source: "미국 30년 장기채(환헤지) 성과 (기준일 2026-06, 수동 추정)",
    updateMethod: "MANUAL", indexType: null,
  },
  {
    key: "TDF2030", ticker: "394280", name: "TIGER TDF2030",
    cumulativeReturn: 88, returnYears: 9, returnPeriod: "9년 (설정이후)",
    source: "생애주기형(TDF2030) 성과 (기준일 2026-06, 수동 추정)",
    updateMethod: "MANUAL", indexType: null,
  },
  {
    key: "혼합국채", ticker: "272580", name: "KODEX 200미국채혼합",
    cumulativeReturn: 92, returnYears: 10, returnPeriod: "10년",
    source: "주식30%+채권70% 혼합 성과 (기준일 2026-06, 수동 추정)",
    updateMethod: "MANUAL", indexType: null,
  },
];

async function main() {
  console.log("Seeding EtfReturn (멱등 upsert)...");
  // 7개뿐이라 동시성 이슈 없음. 그래도 SQLite 관행대로 직렬 upsert로 안전하게.
  for (const e of SEED) {
    await prisma.etfReturn.upsert({
      where: { key: e.key },
      create: { ...e, asOf: AS_OF },
      update: {
        ticker: e.ticker,
        name: e.name,
        cumulativeReturn: e.cumulativeReturn,
        returnYears: e.returnYears,
        returnPeriod: e.returnPeriod,
        source: e.source,
        asOf: AS_OF,
        updateMethod: e.updateMethod,
        indexType: e.indexType,
      },
    });
    console.log(`  ✓ ${e.key.padEnd(14)} ${e.cumulativeReturn}% / ${e.returnYears}y [${e.updateMethod}]`);
  }
  const count = await prisma.etfReturn.count();
  console.log(`\n✓ EtfReturn rows: ${count}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
