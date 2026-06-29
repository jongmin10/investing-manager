/**
 * "52주 신고가 돌파" 필터용 주가 히스토리 백필 — 일회성 수동 실행 스크립트.
 *
 * 배경 (docs/feature-52w-high-breakout.md §2.3, §8.6 D-1/D-2, §8.1):
 *   라이브 StockSnapshot 은 일일 cron 누적분(KST 8일치 ≈ 실거래일 5일)뿐이라
 *   N=60 거래일(≈3개월) 조정 + M=5 돌파 윈도를 못 채운다. 즉 백필이 돌파 필터의 선결 조건.
 *   야간 cron 은 주말·공휴일에도 더미행을 적재(KST 토/일, price=직전 거래일과 동일,
 *   changeRate==0)하므로 시계열에 두 cadence(거래일/캘린더일)가 혼재한다. 백필은 Yahoo
 *   chart 가 반환하는 "거래일만" 적재해 cadence 를 통일한다.
 *
 * 동작 (PO 결정 반영):
 *   - 데이터 소스: 종목별 Yahoo chart API `range=2y&interval=1d`.
 *     timestamp + indicators.quote[0].{high,low,close,volume} 사용.
 *   - 거래일만(D-1): chart 가 주는 거래일 봉만 적재. high/low/close 결손 봉은 스킵.
 *   - high52w 자체 계산(D-2/C-3): 각 거래일 d 의 high52w 를 "직전 252 거래일 high 의
 *     롤링 max"로 계산(라이브 meta.fiftyTwoWeekHigh = 장중 고가 기준 52주 max 에 근접).
 *     가용 데이터 < 252 거래일이면 있는 만큼으로 계산하고 partial 로 표기/집계.
 *     low52w 도 동일하게 252 거래일 low 롤링 min.
 *   - date 정규화(C-2): 각 봉의 거래일을 KST 자정(`YYYY-MM-DDT00:00:00+09:00`)으로
 *     정규화해 저장. 그룹핑/유니크 기준이 KST 캘린더일이 되도록.
 *   - 멱등성(C-2): 같은 KST 캘린더일에 이미 행이 있으면(라이브 cron 행 포함) 그 날은
 *     건너뛴다 → 라이브 행 절대 덮어쓰기 금지 + 같은 날 중복행 방지 + 재실행 안전.
 *     createMany({ skipDuplicates: true }) 로 정확 (stockId,date) 중복까지 이중 방어.
 *   - 레이트리밋: stock-collector 의 PARALLEL/BATCH_DELAY 패턴 재사용(10개 동시, 배치 간 600ms).
 *     종목별 실패는 격리하고 성공/실패/스킵 카운트를 집계 보고. 멱등이라 재실행=재개.
 *
 * 대상 DB: 라이브 PostgreSQL/Supabase (DATABASE_URL). insert-only(비파괴) + 멱등.
 *
 * 모드 플래그:
 *   --dry-run            DB 쓰기 없이 fetch/계산만. 통계 출력(적재 예정 행수·종목별 거래일수·high52w 표본).
 *   --limit N            시총 순위 상위 N 종목만 처리(검증용).
 *   --tickers a,b,c      특정 종목만 처리. id(005930)/yahooSymbol(005930.KS) 모두 매칭(검증용).
 *   (플래그 없음)         전체 유니버스 적재. ★ 사람이 직접 실행할 것(10만 행 규모).
 *
 * 실행:
 *   npx tsx scripts/backfill-stock-history.ts --dry-run --limit 3
 *   npx tsx scripts/backfill-stock-history.ts --tickers 005930.KS,000660.KS
 *   npx tsx scripts/backfill-stock-history.ts            # 전체 (사람이 실행)
 *
 * 주의: StockSnapshot 외 다른 테이블은 절대 건드리지 않는다.
 */
import { PrismaClient } from "@prisma/client";
import { kstDateStr } from "../src/lib/kst";

const prisma = new PrismaClient();

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
  Referer: "https://finance.yahoo.com/",
};

// stock-collector 와 동일: 10개씩 동시 요청, 배치 간 600ms 대기
const PARALLEL = 10;
const BATCH_DELAY = 600;
// 52주 ≈ 252 거래일. 롤링 윈도(당일 포함)
const WINDOW = 252;
// Postgres createMany 단일 INSERT 의 value 튜플 수 상한(문장 크기 보수적 제한)
const INSERT_CHUNK = 500;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

interface Bar {
  kstDay: string; // "YYYY-MM-DD" (KST 캘린더일)
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

interface BackfillRow {
  stockId: string;
  date: Date; // KST 자정
  price: number;
  high52w: number;
  low52w: number;
  changeRate: number | null;
  volume: number | null;
}

interface StockResult {
  stockId: string;
  symbol: string;
  tradingDays: number; // Yahoo 가 준 유효 거래일 봉 수
  partialDays: number; // high52w 가 252 미만 데이터로 계산된 날 수
  candidateRows: number; // 백필 후보(거래일) 수
  existingSkipped: number; // 이미 같은 KST일 행이 있어 건너뛴 수
  toInsert: number; // 실제 insert 예정/완료 행 수
  inserted: number; // 실제 insert 된 행 수(dry-run 은 0)
  sampleHigh52w?: { kstDay: string; price: number; high52w: number; ratioPct: number; partial: boolean };
}

/** KST 캘린더일 문자열("YYYY-MM-DD") → KST 자정 Date */
function kstMidnight(kstDay: string): Date {
  return new Date(`${kstDay}T00:00:00.000+09:00`);
}

/** Yahoo chart range=2y 일봉을 거래일 Bar[] (KST일 오름차순)로 반환. 실패 시 null. */
async function fetchHistory(symbol: string): Promise<Bar[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=2y&includePrePost=false`;

  let res: Response | null = null;
  try {
    res = await fetch(url, {
      headers: YF_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        timestamp?: number[];
        indicators?: {
          quote?: {
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }[];
        };
      }
    | undefined;
  if (!result) return null;

  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0];
  const highs = q?.high ?? [];
  const lows = q?.low ?? [];
  const closes = q?.close ?? [];
  const volumes = q?.volume ?? [];
  if (ts.length === 0) return null;

  // KST일 → Bar (결손 봉 스킵, 같은 KST일 중복 시 마지막 값 유지)
  const byDay = new Map<string, Bar>();
  for (let i = 0; i < ts.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    // high/low/close 중 하나라도 결손이면 판정 신뢰 불가 → 스킵
    if (high == null || low == null || close == null) continue;
    if (!(high > 0) || !(close > 0)) continue;
    const kstDay = kstDateStr(new Date(ts[i] * 1000));
    byDay.set(kstDay, {
      kstDay,
      high,
      low,
      close,
      volume: typeof volumes[i] === "number" ? (volumes[i] as number) : null,
    });
  }

  return Array.from(byDay.values()).sort((a, b) => a.kstDay.localeCompare(b.kstDay));
}

/** 단조 데크로 윈도(당일 포함) 롤링 max/min — O(n). */
function rollingExtreme(values: number[], window: number, kind: "max" | "min"): number[] {
  const out: number[] = new Array(values.length);
  const dq: number[] = []; // 인덱스 보관 (max=감소열 / min=증가열)
  for (let i = 0; i < values.length; i++) {
    while (dq.length && dq[0] < i - window + 1) dq.shift();
    if (kind === "max") {
      while (dq.length && values[dq[dq.length - 1]] <= values[i]) dq.pop();
    } else {
      while (dq.length && values[dq[dq.length - 1]] >= values[i]) dq.pop();
    }
    dq.push(i);
    out[i] = values[dq[0]];
  }
  return out;
}

/** Bar[] → BackfillRow[] (high52w/low52w 롤링 계산 + KST 자정 + changeRate). */
function buildRows(stockId: string, bars: Bar[]): { rows: BackfillRow[]; partialDays: number } {
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const high52w = rollingExtreme(highs, WINDOW, "max");
  const low52w = rollingExtreme(lows, WINDOW, "min");

  let partialDays = 0;
  const rows: BackfillRow[] = bars.map((b, i) => {
    if (i < WINDOW - 1) partialDays++;
    const prevClose = i > 0 ? bars[i - 1].close : null;
    const changeRate =
      prevClose != null && prevClose > 0
        ? parseFloat((((b.close - prevClose) / prevClose) * 100).toFixed(2))
        : null;
    return {
      stockId,
      date: kstMidnight(b.kstDay),
      price: b.close,
      high52w: high52w[i],
      low52w: low52w[i],
      changeRate,
      volume: b.volume,
    };
  });
  return { rows, partialDays };
}

interface Args {
  dryRun: boolean;
  limit: number | null;
  tickers: string[] | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((a) => a.startsWith("--limit"));
  let limit: number | null = null;
  if (limitArg) {
    const eq = limitArg.includes("=") ? limitArg.split("=")[1] : argv[argv.indexOf(limitArg) + 1];
    const n = parseInt(eq ?? "", 10);
    if (Number.isFinite(n) && n > 0) limit = n;
  }
  const tickersArg = argv.find((a) => a.startsWith("--tickers"));
  let tickers: string[] | null = null;
  if (tickersArg) {
    const eq = tickersArg.includes("=")
      ? tickersArg.split("=")[1]
      : argv[argv.indexOf(tickersArg) + 1];
    tickers = (eq ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tickers.length === 0) tickers = null;
  }
  return { dryRun, limit, tickers };
}

async function resolveStocks(args: Args): Promise<{ id: string; yahooSymbol: string }[]> {
  // collectAllStocks 와 동일: rank 보유 유니버스 우선, 없으면 전체(초기 시드 호환)
  const ranked = await prisma.stock.findMany({
    where: { rank: { not: null } },
    select: { id: true, yahooSymbol: true },
    orderBy: { rank: "asc" },
  });
  let stocks =
    ranked.length > 0
      ? ranked
      : await prisma.stock.findMany({
          select: { id: true, yahooSymbol: true },
          orderBy: { id: "asc" },
        });

  if (args.tickers) {
    const want = new Set(args.tickers.map((t) => t.toUpperCase()));
    stocks = stocks.filter(
      (s) =>
        want.has(s.id.toUpperCase()) ||
        want.has(s.yahooSymbol.toUpperCase()) ||
        want.has(s.yahooSymbol.replace(/\.(KS|KQ)$/i, "").toUpperCase())
    );
  }
  if (args.limit != null) stocks = stocks.slice(0, args.limit);
  return stocks;
}

async function processStock(
  stock: { id: string; yahooSymbol: string },
  dryRun: boolean
): Promise<StockResult> {
  const base: StockResult = {
    stockId: stock.id,
    symbol: stock.yahooSymbol,
    tradingDays: 0,
    partialDays: 0,
    candidateRows: 0,
    existingSkipped: 0,
    toInsert: 0,
    inserted: 0,
  };

  const bars = await fetchHistory(stock.yahooSymbol);
  if (!bars || bars.length === 0) {
    throw new Error("Yahoo 데이터 없음/요청 실패");
  }
  base.tradingDays = bars.length;

  const { rows, partialDays } = buildRows(stock.id, bars);
  base.partialDays = partialDays;
  base.candidateRows = rows.length;

  // 멱등성: 백필 구간에 이미 존재하는 KST일은 건너뜀(라이브 cron 행 보존)
  const rangeStart = rows[0].date;
  const rangeEnd = new Date(rows[rows.length - 1].date.getTime() + 24 * 60 * 60 * 1000);
  const existing = await prisma.stockSnapshot.findMany({
    where: { stockId: stock.id, date: { gte: rangeStart, lte: rangeEnd } },
    select: { date: true },
  });
  const existingDays = new Set(existing.map((e) => kstDateStr(e.date)));

  const toInsert = rows.filter((r) => !existingDays.has(kstDateStr(r.date)));
  base.existingSkipped = rows.length - toInsert.length;
  base.toInsert = toInsert.length;

  // high52w 표본(마지막 거래일)
  const last = rows[rows.length - 1];
  base.sampleHigh52w = {
    kstDay: kstDateStr(last.date),
    price: parseFloat(last.price.toFixed(2)),
    high52w: parseFloat(last.high52w.toFixed(2)),
    ratioPct: last.high52w > 0 ? parseFloat(((last.price / last.high52w) * 100).toFixed(1)) : 0,
    partial: rows.length < WINDOW,
  };

  if (!dryRun && toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const res = await prisma.stockSnapshot.createMany({
        data: chunk.map((r) => ({
          stockId: r.stockId,
          date: r.date,
          price: r.price,
          high52w: r.high52w,
          low52w: r.low52w,
          changeRate: r.changeRate,
          volume: r.volume,
        })),
        skipDuplicates: true, // 정확 (stockId,date) 중복 이중 방어
      });
      base.inserted += res.count;
    }
  }

  return base;
}

async function main() {
  const args = parseArgs();
  const stocks = await resolveStocks(args);

  const mode = args.dryRun
    ? "DRY-RUN (DB 미기록)"
    : args.limit != null || args.tickers
    ? "부분 적재 (검증용)"
    : "전체 적재 (LIVE DB 쓰기)";

  console.log("─".repeat(70));
  console.log(`52주 신고가 돌파 백필 — ${mode}`);
  console.log(`대상 종목: ${stocks.length}개` + (args.tickers ? ` [${args.tickers.join(", ")}]` : ""));
  if (!args.dryRun && args.limit == null && !args.tickers) {
    console.log("★ 전체 유니버스를 LIVE PostgreSQL 에 적재합니다 (insert-only·멱등).");
  }
  console.log("─".repeat(70));

  if (stocks.length === 0) {
    console.log("대상 종목 없음 → 종료");
    return;
  }

  const start = Date.now();
  const results: StockResult[] = [];
  const failed: { symbol: string; reason: string }[] = [];

  for (let i = 0; i < stocks.length; i += PARALLEL) {
    const batch = stocks.slice(i, i + PARALLEL);
    const settled = await Promise.allSettled(
      batch.map((s) => processStock(s, args.dryRun))
    );
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
        const v = r.value;
        const s = v.sampleHigh52w;
        console.log(
          `  ✓ ${v.symbol.padEnd(12)} 거래일 ${String(v.tradingDays).padStart(3)} · ` +
            `예정 ${String(v.toInsert).padStart(3)} · 스킵(기존) ${String(v.existingSkipped).padStart(3)}` +
            (args.dryRun ? "" : ` · 적재 ${v.inserted}`) +
            (v.partialDays ? ` · partial ${v.partialDays}` : "") +
            (s ? ` · 표본 ${s.kstDay} ratio ${s.ratioPct}%${s.partial ? "(부분)" : ""}` : "")
        );
      } else {
        const sym = batch[j].yahooSymbol;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        failed.push({ symbol: sym, reason });
        console.log(`  ✗ ${sym.padEnd(12)} 실패: ${reason}`);
      }
    }
    if (i + PARALLEL < stocks.length) await sleep(BATCH_DELAY);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  const totalTradingDays = results.reduce((a, r) => a + r.tradingDays, 0);
  const totalCandidate = results.reduce((a, r) => a + r.candidateRows, 0);
  const totalToInsert = results.reduce((a, r) => a + r.toInsert, 0);
  const totalInserted = results.reduce((a, r) => a + r.inserted, 0);
  const totalSkipped = results.reduce((a, r) => a + r.existingSkipped, 0);
  const totalPartial = results.reduce((a, r) => a + r.partialDays, 0);
  const avgTradingDays = results.length ? Math.round(totalTradingDays / results.length) : 0;

  console.log("─".repeat(70));
  console.log(`완료 (${duration}s)`);
  console.log(`  성공 종목      : ${results.length} / ${stocks.length}`);
  console.log(`  실패 종목      : ${failed.length}` + (failed.length ? ` [${failed.map((f) => f.symbol).join(", ")}]` : ""));
  console.log(`  평균 거래일수  : ${avgTradingDays}일/종목`);
  console.log(`  후보 행(거래일): ${totalCandidate}`);
  console.log(`  기존 스킵 행   : ${totalSkipped} (라이브/이전 백필 행 보존)`);
  console.log(`  partial 행     : ${totalPartial} (252거래일 미만 데이터로 high52w 계산)`);
  if (args.dryRun) {
    console.log(`  ★ 적재 예정 행 : ${totalToInsert} (DRY-RUN — 실제 쓰기 없음)`);
    console.log("─".repeat(70));
    // 전체 적재 규모/시간 추정
    const perStockInsert = results.length ? totalToInsert / results.length : 0;
    console.log(
      `참고: 종목당 평균 ${Math.round(perStockInsert)}행 예정. ` +
        `유니버스 200종목 가정 시 ≈ ${Math.round(perStockInsert * 200).toLocaleString()}행.`
    );
  } else {
    console.log(`  ★ 적재 행      : ${totalInserted}`);
  }
  console.log("─".repeat(70));
}

main()
  .catch((err) => {
    console.error("백필 스크립트 오류:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
