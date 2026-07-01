/**
 * 지수 일봉 종가 백필 (DailyIndexPrice) — 수동 실행용, 멱등.
 *
 * 목적:
 *   2000년 이후 5대 지수의 일봉 종가를 Yahoo Finance 에서 받아 DailyIndexPrice 에 적재한다.
 *   `/api/returns/monthly` 는 이 일봉을 월말 리샘플링해 월수익률·MDD 를 도출한다(스펙 §5).
 *
 * 대상 시리즈(스펙 §3.1 확정):
 *   KOSPI=^KS11, KOSDAQ=^KQ11, DOW=^DJI, SP500=^GSPC, NASDAQ=^IXIC(종합, ^NDX 아님)
 *   수익률 정의: 가격지수 close 기준(배당 미반영), 해외지수는 원통화 그대로(환율환산 없음).
 *
 * 동작:
 *   - interval=1d, period1=2000-01-01(Unix초)~period2=현재 로 명시 요청.
 *     (range=max 는 일부 지수에서 timestamp 누락 사례가 관측됨 — 스펙 §3.1, 사용 금지)
 *   - 일봉 timestamp 는 거래일 로컬 개장시각(거래소 로컬) 기준이므로, meta.gmtoffset 을
 *     더해 로컬 벽시계로 환산한 뒤 그 거래일의 UTC 자정으로 정규화한다(월 경계 밀림 방지 — 스펙 §4).
 *   - (series, date) 멱등 upsert. BATCH=20 병렬(SQLite/대량 안전 한계, 스펙 §3.4).
 *   - 코스닥은 Yahoo가 2000-10 부터 제공 → 결손 구간(2000-01~09)은 억지 삽입하지 않음.
 *
 * 실행:
 *   npx tsx scripts/backfill-daily-index.ts                    # 5종 전체
 *   npx tsx scripts/backfill-daily-index.ts --series=KOSPI,SP500
 *
 * 주의: DailyIndexPrice 외 다른 테이블은 절대 건드리지 않는다. insert/upsert-only(deleteMany 없음).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
  Referer: "https://finance.yahoo.com/",
};

// 5대 지수 심볼 매핑 (스펙 §3.1). dp=소수 자릿수(표시/저장 반올림용)
const SERIES = [
  { series: "KOSPI",  yahoo: "^KS11",  dp: 2 },
  { series: "KOSDAQ", yahoo: "^KQ11",  dp: 2 },
  { series: "DOW",    yahoo: "^DJI",   dp: 2 },
  { series: "SP500",  yahoo: "^GSPC",  dp: 2 },
  { series: "NASDAQ", yahoo: "^IXIC",  dp: 2 },
] as const;

const PERIOD1 = Math.floor(Date.UTC(2000, 0, 1) / 1000); // 2000-01-01 00:00:00 UTC
const BATCH = 20; // 병렬 upsert 안전 한계 (AGENTS.md / 스펙 §3.4)

interface DayPoint {
  date: Date; // 거래일 UTC 자정 정규화
  close: number;
}

async function fetchDaily(yahoo: string, dp: number): Promise<DayPoint[]> {
  const encoded = encodeURIComponent(yahoo);
  const period2 = Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}` +
    `?interval=1d&period1=${PERIOD1}&period2=${period2}&includePrePost=false`;

  const res = await fetch(url, {
    headers: YF_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Yahoo ${yahoo} HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const gmtoffset: number = result.meta?.gmtoffset ?? 0; // 초
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  // (series, date) 는 unique 이므로 같은 거래일이 겹치면 마지막 값으로 병합(중복 방지)
  const byDay = new Map<string, number>();
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue; // 미확정/결측 일봉 스킵
    // 로컬 벽시계로 환산 후 UTC getter 로 거래일(Y-M-D) 추출 (월 경계 밀림 방지)
    const local = new Date((timestamps[i] + gmtoffset) * 1000);
    const dayStr = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(
      local.getUTCDate()
    ).padStart(2, "0")}`;
    byDay.set(dayStr, parseFloat(c.toFixed(dp)));
  }

  return [...byDay.entries()]
    .map(([dayStr, close]) => ({ date: new Date(`${dayStr}T00:00:00.000Z`), close }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function main() {
  const argv = process.argv.slice(2);
  const seriesArg = argv.find((a) => a.startsWith("--series="));
  const wanted = seriesArg
    ? seriesArg.slice("--series=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : SERIES.map((s) => s.series);

  const targets = SERIES.filter((s) => wanted.includes(s.series));
  if (targets.length === 0) {
    throw new Error(`알 수 없는 series: ${wanted.join(",")} (지원: ${SERIES.map((s) => s.series).join(",")})`);
  }

  console.log(`일봉 종가 백필 시작: ${targets.map((t) => t.series).join(", ")}\n`);

  for (let t = 0; t < targets.length; t++) {
    const { series, yahoo, dp } = targets[t];
    try {
      const points = await fetchDaily(yahoo, dp);
      if (points.length === 0) {
        console.log(`  - ${series} (${yahoo}): 데이터 없음 → 스킵`);
        continue;
      }

      // 멱등 upsert (배치)
      for (let i = 0; i < points.length; i += BATCH) {
        const slice = points.slice(i, i + BATCH);
        await Promise.all(
          slice.map((p) =>
            prisma.dailyIndexPrice.upsert({
              where: { series_date: { series, date: p.date } },
              create: { series, date: p.date, close: p.close },
              update: { close: p.close },
            })
          )
        );
      }

      const first = points[0];
      const last = points[points.length - 1];
      console.log(
        `  ✓ ${series.padEnd(7)} ${points.length}행 ` +
        `(최초 ${first.date.toISOString().slice(0, 10)} @${first.close} → ` +
        `최근 ${last.date.toISOString().slice(0, 10)} @${last.close})`
      );
    } catch (err) {
      console.error(`  ✗ ${series} 백필 실패:`, err);
    }

    // 시리즈 간 간격 (Yahoo rate-limit 완화)
    if (t < targets.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("\n완료.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
