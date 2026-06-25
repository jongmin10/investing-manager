/**
 * 지수 3년 일별 히스토리 백필 (IndicatorRecord) — 수동 실행용.
 *
 * 목적:
 *   recalc-etf-returns.mjs 는 IndicatorRecord(type) 의 일별 히스토리로 ETF 누적수익률(CAGR)을
 *   산출한다. 그런데 야간 cron(collectRealtimeData)은 "당일 1포인트"만 upsert 하므로,
 *   처음에는 히스토리가 비어 있어 CAGR 산출이 불가능하다. 이 스크립트가 Yahoo Finance 의
 *   3년치 일봉을 받아 IndicatorRecord 에 1회성으로 백필해 recalc 의 입력 데이터를 채운다.
 *
 *   특히 KOSPI200(type="KOSPI200", yahoo="^KS200")은 EtfReturn.KOSPI200(INDEX_CAGR)의
 *   indexType 대상이므로, 이 백필 → `node scripts/recalc-etf-returns.mjs --apply` 순서로
 *   실측 누적수익률을 반영한다.
 *
 * 동작:
 *   - 대상 지수의 3년 일봉을 Yahoo chart API(range=3y)로 가져온다.
 *   - 해당 type 의 기존 IndicatorRecord 를 전부 삭제 후 재삽입(멱등, 재실행 안전).
 *   - createMany 미지원/대량 환경을 고려해 삽입은 BATCH=20 의 병렬 create 로 처리한다.
 *
 * 대상 지정:
 *   - 인자 없으면 기본 KOSPI200 만 백필.
 *   - `--all` 이면 collector.REALTIME_SYMBOLS 전체.
 *   - `--type=KOSPI200,SP500` 처럼 콤마구분 type 지정 가능.
 *
 * 실행:
 *   npx tsx scripts/backfill-index-history.ts                 # KOSPI200 만
 *   npx tsx scripts/backfill-index-history.ts --type=KOSPI200,SP500
 *   npx tsx scripts/backfill-index-history.ts --all
 *
 * 주의: IndicatorRecord 외 다른 테이블은 절대 건드리지 않는다.
 */
import { PrismaClient } from "@prisma/client";
import { REALTIME_SYMBOLS } from "../src/lib/collector";

const prisma = new PrismaClient();

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
  Referer: "https://finance.yahoo.com/",
};

const BATCH = 20; // SQLite/대량 병렬 upsert 안전 한계

interface HistoryPoint {
  date: Date;
  value: number;
}

async function fetchHistory(yahoo: string, dp: number): Promise<HistoryPoint[]> {
  const encoded = encodeURIComponent(yahoo);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=3y&includePrePost=false`;

  const res = await fetch(url, {
    headers: YF_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Yahoo ${yahoo} HTTP ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000),
      value: closes[i] != null ? parseFloat((closes[i] as number).toFixed(dp)) : NaN,
    }))
    .filter((p) => !isNaN(p.value));
}

function resolveTargets(): { type: string; yahoo: string; dp: number }[] {
  const argv = process.argv.slice(2);
  if (argv.includes("--all")) {
    return REALTIME_SYMBOLS.map((s) => ({ type: s.type, yahoo: s.yahoo, dp: s.dp }));
  }
  const typeArg = argv.find((a) => a.startsWith("--type="));
  const wanted = typeArg
    ? typeArg.slice("--type=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : ["KOSPI200"]; // 기본값

  const targets = wanted.map((t) => {
    const sym = REALTIME_SYMBOLS.find((s) => s.type === t);
    if (!sym) throw new Error(`알 수 없는 type: ${t} (REALTIME_SYMBOLS 에 없음)`);
    return { type: sym.type, yahoo: sym.yahoo, dp: sym.dp };
  });
  return targets;
}

async function main() {
  const targets = resolveTargets();
  console.log(`지수 히스토리 백필 시작: ${targets.map((t) => t.type).join(", ")}\n`);

  for (const { type, yahoo, dp } of targets) {
    try {
      const points = await fetchHistory(yahoo, dp);
      if (points.length === 0) {
        console.log(`  - ${type} (${yahoo}): 데이터 없음 → 스킵`);
        continue;
      }

      // 기존 전체 삭제 후 재삽입(멱등)
      await prisma.indicatorRecord.deleteMany({ where: { type } });

      let inserted = 0;
      for (let i = 0; i < points.length; i += BATCH) {
        const slice = points.slice(i, i + BATCH);
        await Promise.all(
          slice.map((p) =>
            prisma.indicatorRecord.create({
              data: { type, value: p.value, recordedAt: p.date },
            })
          )
        );
        inserted += slice.length;
      }

      const first = points[0];
      const last = points[points.length - 1];
      console.log(
        `  ✓ ${type.padEnd(10)} ${inserted} 포인트 ` +
        `(${first.date.toISOString().slice(0, 10)} ~ ${last.date.toISOString().slice(0, 10)}, ` +
        `${first.value} → ${last.value})`
      );
    } catch (err) {
      console.error(`  ✗ ${type} 백필 실패:`, err);
    }
  }

  console.log("\n완료. 다음 단계: node scripts/recalc-etf-returns.mjs --apply");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
