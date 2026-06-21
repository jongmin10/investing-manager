import { prisma } from "./prisma";
import { kstDateStr, kstDayRange } from "./kst";

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
  sector:        string | null; // NAVER 업종 (동적 유니버스 신규 종목 보강용)
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
  pbr: number | null; dividendYield: number | null; sector: string | null;
}> {
  const empty = { per: null, cnsPer: null, cnsEps: null, pbr: null, dividendYield: null, sector: null };
  try {
    const res = await fetch(`https://finance.naver.com/item/main.naver?code=${code}`, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return empty;
    const html = await res.text();
    const parse = (id: string) => {
      const m = html.match(new RegExp(`id="${id}"[^>]*>([\\d,\\.]+)<`));
      return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    };
    // 업종(추가 요청 없이 같은 페이지에서 파싱)
    const sm = html.match(/sise_group_detail\.naver\?type=upjong&no=\d+["'][^>]*>\s*([^<]+?)\s*</);
    return {
      per:           parse("_per"),
      cnsPer:        parse("_cns_per"),
      cnsEps:        parse("_cns_eps"),
      pbr:           parse("_pbr"),
      dividendYield: parse("_dvr"),
      sector:        sm ? sm[1].replace(/\s+/g, " ").trim() : null,
    };
  } catch {
    return empty;
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
    isKorean ? fetchNaverValuation(naverCode) : Promise.resolve({ per: null, cnsPer: null, cnsEps: null, pbr: null, dividendYield: null, sector: null }),
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
    sector:        naver.sector,
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── 전 종목 수집 ──────────────────────────────────────────
export async function collectAllStocks(
  onProgress?: (done: number, total: number) => void,
  options?: { offset?: number; limit?: number }
): Promise<CollectStocksResult> {
  const start = Date.now();

  // 수집 대상 = 현재 시총 유니버스(rank 보유) 우선, 없으면 전체(초기 시드 호환)
  const ranked = await prisma.stock.findMany({
    where: { rank: { not: null } }, select: { id: true, yahooSymbol: true, sector: true }, orderBy: { rank: "asc" },
  });
  const allStocks = ranked.length > 0
    ? ranked
    : await prisma.stock.findMany({ select: { id: true, yahooSymbol: true, sector: true }, orderBy: { id: "asc" } });
  const stocks = options?.offset != null || options?.limit != null
    ? allStocks.slice(options.offset ?? 0, options.limit ? (options.offset ?? 0) + options.limit : undefined)
    : allStocks;
  const total  = stocks.length;
  const sectorById = new Map(stocks.map((s) => [s.id, s.sector]));

  const today    = new Date();
  const todayStr = kstDateStr(today);            // KST 기준 오늘
  const { start: dayStart, end: dayEnd } = kstDayRange(todayStr);

  const failed: string[] = [];
  let updated = 0;
  let skipped = 0;
  let done    = 0;

  // 오늘 스냅샷을 한 번에 일괄 조회 (종목별 findFirst 제거)
  const existingSnaps = await prisma.stockSnapshot.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) }, date: { gte: dayStart, lte: dayEnd } },
  });
  const existingMap = new Map(existingSnaps.map((s) => [s.stockId, s]));

  // PARALLEL개씩 병렬 처리
  for (let i = 0; i < stocks.length; i += PARALLEL) {
    const batch = stocks.slice(i, i + PARALLEL);

    const quotes = await Promise.all(batch.map((s) => fetchOne(s.yahooSymbol)));

    // 배치 내 DB 쓰기를 모아 병렬 실행 (순차 await 제거)
    const writes: Promise<unknown>[] = [];

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

      // 업종 보강: 새로 파싱한 sector가 있고 기존과 다르면 Stock.sector 갱신 (추가 요청 없음)
      if (quote.sector && quote.sector !== sectorById.get(stock.id)) {
        writes.push(prisma.stock.update({ where: { id: stock.id }, data: { sector: quote.sector } }));
      }

      const existing = existingMap.get(stock.id);

      if (existing) {
        // 가격 변동이 없어도 per·cnsPer·pbr은 항상 갱신
        const priceChanged = Math.abs(existing.price - quote.price) > 1;
        const valuationChanged = existing.cnsPer !== quote.cnsPer
          || existing.per    !== quote.trailingPE
          || existing.cnsEps !== quote.cnsEps
          || existing.dividendYield !== quote.dividendYield;
        if (priceChanged || valuationChanged) {
          writes.push(prisma.stockSnapshot.update({
            where: { id: existing.id },
            data: { ...data, date: today },
          }));
          updated++;
        } else {
          skipped++;
        }
      } else {
        writes.push(prisma.stockSnapshot.create({
          data: { stockId: stock.id, date: today, ...data },
        }));
        updated++;
      }

      done++;
      onProgress?.(done, total);
    }

    if (writes.length > 0) await Promise.all(writes);
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

  const { start, end } = kstDayRange(kstDateStr()); // KST 기준 오늘
  const todayCount = await prisma.stockSnapshot.count({
    where: { date: { gte: start, lte: end } },
  });

  return { stockCount, snapshotCount, todayCount, lastUpdated: latestSnapshot?.date ?? null, isUpToDate: todayCount > 0 };
}
