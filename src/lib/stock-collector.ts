import { prisma } from "./prisma";

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
  Referer: "https://finance.yahoo.com/",
};

// 병렬 처리: 10개씩 동시 요청, 배치 간 600ms 대기
const PARALLEL = 10;
const BATCH_DELAY = 600;

export interface StockQuote {
  symbol:        string;
  price:         number;
  changePercent: number; // 전일 대비 등락률 (%)
  high52w:       number;
  low52w:        number;
  volume:        number | null;
}

export interface CollectStocksResult {
  success:   boolean;
  total:     number;
  updated:   number;
  failed:    string[];
  skipped:   number;
  duration:  number;
  updatedAt: Date;
}

// ── v8 chart API (기존 collector와 동일한 방식) ───────────
async function fetchOne(symbol: string): Promise<StockQuote | null> {
  // range=5d: 52주 고저는 meta에 내장, 전일 대비는 최근 2개 종가로 계산
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: YF_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let json: unknown;
  try { json = await res.json(); } catch { return null; }

  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as {
    meta: Record<string, unknown>;
    indicators?: { quote?: { close?: (number | null)[] }[] };
    timestamp?: number[];
  } | undefined;

  if (!result) return null;

  const meta   = result.meta;
  const price  = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  if (!price) return null;

  const high52w = typeof meta.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh : price;
  const low52w  = typeof meta.fiftyTwoWeekLow  === "number" ? meta.fiftyTwoWeekLow  : price;
  const volume  = typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : null;

  // 전일 대비 등락률: 최근 2개 종가로 계산
  const closes = result.indicators?.quote?.[0]?.close?.filter((v): v is number => v != null) ?? [];
  let changePercent = 0;
  if (closes.length >= 2) {
    const prev = closes[closes.length - 2];
    const cur  = closes[closes.length - 1];
    if (prev > 0) changePercent = parseFloat(((cur - prev) / prev * 100).toFixed(2));
  }

  return { symbol, price, changePercent, high52w, low52w, volume };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── 전 종목 수집 ──────────────────────────────────────────
export async function collectAllStocks(
  onProgress?: (done: number, total: number) => void
): Promise<CollectStocksResult> {
  const start = Date.now();

  const stocks = await prisma.stock.findMany({ select: { id: true, yahooSymbol: true } });
  const total  = stocks.length;

  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayStart = new Date(todayStr + "T00:00:00.000Z");
  const dayEnd   = new Date(todayStr + "T23:59:59.999Z");

  const failed: string[] = [];
  let updated = 0;
  let skipped = 0;
  let done    = 0;

  // PARALLEL개씩 병렬 처리
  for (let i = 0; i < stocks.length; i += PARALLEL) {
    const batch = stocks.slice(i, i + PARALLEL);

    const quotes = await Promise.all(batch.map((s) => fetchOne(s.yahooSymbol)));

    for (let j = 0; j < batch.length; j++) {
      const stock = batch[j];
      const quote = quotes[j];

      if (!quote || quote.price === 0) {
        failed.push(stock.id);
        done++;
        onProgress?.(done, total);
        continue;
      }

      const data = {
        price:      quote.price,
        high52w:    quote.high52w,
        low52w:     quote.low52w,
        changeRate: quote.changePercent,
        volume:     quote.volume,
        // marketCap, per, pbr: Phase 4 (DART) 에서 채움
      };

      const existing = await prisma.stockSnapshot.findFirst({
        where: { stockId: stock.id, date: { gte: dayStart, lte: dayEnd } },
      });

      if (existing) {
        if (Math.abs(existing.price - quote.price) > 1) {
          await prisma.stockSnapshot.update({
            where: { id: existing.id },
            data: { ...data, date: today },
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await prisma.stockSnapshot.create({
          data: { stockId: stock.id, date: today, ...data },
        });
        updated++;
      }

      done++;
      onProgress?.(done, total);
    }

    if (i + PARALLEL < stocks.length) await sleep(BATCH_DELAY);
  }

  return {
    success:   updated > 0,
    total,
    updated,
    failed,
    skipped,
    duration:  Date.now() - start,
    updatedAt: today,
  };
}

// ── 상태 조회 ─────────────────────────────────────────────
export async function getCollectStatus() {
  const [stockCount, snapshotCount, latestSnapshot] = await Promise.all([
    prisma.stock.count(),
    prisma.stockSnapshot.count(),
    prisma.stockSnapshot.findFirst({ orderBy: { date: "desc" } }),
  ]);

  const today    = new Date().toISOString().slice(0, 10);
  const todayCount = await prisma.stockSnapshot.count({
    where: {
      date: {
        gte: new Date(today + "T00:00:00.000Z"),
        lte: new Date(today + "T23:59:59.999Z"),
      },
    },
  });

  return { stockCount, snapshotCount, todayCount, lastUpdated: latestSnapshot?.date ?? null, isUpToDate: todayCount > 0 };
}
