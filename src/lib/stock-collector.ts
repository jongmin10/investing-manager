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
  changePercent: number;
  high52w:       number;
  low52w:        number;
  volume:        number | null;
  trailingPE:    number | null; // NAVER _per      (TTM PER)
  cnsPer:        number | null; // NAVER _cns_per  (추정 PER)
  cnsEps:        number | null; // NAVER _cns_eps  (추정 EPS, 원)
  pbr:           number | null; // NAVER _pbr
  dividendYield: number | null; // NAVER _dvr      (배당수익률 %)
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

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://finance.naver.com/",
};

// NAVER Finance HTML에서 PER·PBR 파싱 (한국 주식 전용)
async function fetchNaverValuation(code: string): Promise<{
  per: number | null; cnsPer: number | null; cnsEps: number | null;
  pbr: number | null; dividendYield: number | null;
}> {
  try {
    const res = await fetch(`https://finance.naver.com/item/main.naver?code=${code}`, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { per: null, cnsPer: null, cnsEps: null, pbr: null, dividendYield: null };
    const html = await res.text();
    const parse = (id: string) => {
      const m = html.match(new RegExp(`id="${id}"[^>]*>([\\d,\\.]+)<`));
      return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    };
    return {
      per:           parse("_per"),
      cnsPer:        parse("_cns_per"),
      cnsEps:        parse("_cns_eps"),
      pbr:           parse("_pbr"),
      dividendYield: parse("_dvr"),
    };
  } catch {
    return { per: null, cnsPer: null, cnsEps: null, pbr: null, dividendYield: null };
  }
}

// ── v8 chart API (가격·52주 고저·거래량) + NAVER Finance (PER·PBR) 병렬 수집 ──
async function fetchOne(symbol: string): Promise<StockQuote | null> {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
  const naverCode = symbol.replace(/\.(KS|KQ)$/, "");
  const isKorean  = naverCode !== symbol;

  const [chartRes, naver] = await Promise.all([
    fetch(chartUrl, { headers: YF_HEADERS, cache: "no-store", signal: AbortSignal.timeout(10_000) })
      .catch(() => null),
    isKorean ? fetchNaverValuation(naverCode) : Promise.resolve({ per: null, cnsPer: null, cnsEps: null, pbr: null, dividendYield: null }),
  ]);

  if (!chartRes?.ok) return null;

  let json: unknown;
  try { json = await chartRes.json(); } catch { return null; }

  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as {
    meta: Record<string, unknown>;
    indicators?: { quote?: { close?: (number | null)[] }[] };
  } | undefined;
  if (!result) return null;

  const meta  = result.meta;
  const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  if (!price) return null;

  const closes = result.indicators?.quote?.[0]?.close?.filter((v): v is number => v != null) ?? [];
  let changePercent = 0;
  if (closes.length >= 2) {
    const prev = closes[closes.length - 2];
    const cur  = closes[closes.length - 1];
    if (prev > 0) changePercent = parseFloat(((cur - prev) / prev * 100).toFixed(2));
  }

  return {
    symbol,
    price,
    changePercent,
    high52w:    typeof meta.fiftyTwoWeekHigh      === "number" ? meta.fiftyTwoWeekHigh      : price,
    low52w:     typeof meta.fiftyTwoWeekLow       === "number" ? meta.fiftyTwoWeekLow       : price,
    volume:     typeof meta.regularMarketVolume   === "number" ? meta.regularMarketVolume   : null,
    trailingPE:    naver.per,
    cnsPer:        naver.cnsPer,
    cnsEps:        naver.cnsEps,
    pbr:           naver.pbr,
    dividendYield: naver.dividendYield,
  };
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
        price:         quote.price,
        high52w:       quote.high52w,
        low52w:        quote.low52w,
        changeRate:    quote.changePercent,
        volume:        quote.volume,
        per:           quote.trailingPE,
        cnsPer:        quote.cnsPer,
        cnsEps:        quote.cnsEps,
        pbr:           quote.pbr,
        dividendYield: quote.dividendYield,
      };

      const existing = await prisma.stockSnapshot.findFirst({
        where: { stockId: stock.id, date: { gte: dayStart, lte: dayEnd } },
      });

      if (existing) {
        // 가격 변동이 없어도 per·cnsPer·pbr은 항상 갱신
        const priceChanged = Math.abs(existing.price - quote.price) > 1;
        const valuationChanged = existing.cnsPer !== quote.cnsPer
          || existing.per    !== quote.trailingPE
          || existing.cnsEps !== quote.cnsEps
          || existing.dividendYield !== quote.dividendYield;
        if (priceChanged || valuationChanged) {
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
