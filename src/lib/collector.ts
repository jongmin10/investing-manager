import { prisma } from "./prisma";

// 실시간 수집 대상 지표 — Yahoo Finance 심볼 매핑
export const REALTIME_SYMBOLS = [
  { type: "KOSPI",           yahoo: "^KS11",  dp: 1 },
  { type: "KOSPI200",        yahoo: "^KS200", dp: 2 },
  { type: "KOSDAQ",          yahoo: "^KQ11",  dp: 2 },
  { type: "SP500",           yahoo: "^GSPC",  dp: 2 },
  { type: "NASDAQ100",       yahoo: "^NDX",   dp: 2 },
  { type: "SOX",             yahoo: "^SOX",   dp: 2 },
  { type: "VIX",             yahoo: "^VIX",   dp: 2 },
  { type: "KRW_USD",         yahoo: "KRW=X",  dp: 1 },
  { type: "US_TREASURY_10Y", yahoo: "^TNX",   dp: 2 },
] as const;

export type RealtimeType = (typeof REALTIME_SYMBOLS)[number]["type"];

export interface CollectResult {
  success: boolean;
  updated: string[];
  failed: string[];
  values: Record<string, number>;
  error?: string;
}

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
  Referer: "https://finance.yahoo.com/",
};

interface QuoteResult {
  price: number;
  marketTime: Date; // 실제 마지막 거래 시각 (Yahoo Finance regularMarketTime)
}

async function fetchQuote(yahoo: string): Promise<QuoteResult | null> {
  const encoded = encodeURIComponent(yahoo);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d&includePrePost=false`;

  const res = await fetch(url, {
    headers: YF_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const ts    = meta?.regularMarketTime; // Unix timestamp (seconds)

  if (typeof price !== "number") return null;
  // regularMarketTime이 없으면 현재 시각 사용
  const marketTime = typeof ts === "number" ? new Date(ts * 1000) : new Date();
  return { price, marketTime };
}

export async function collectRealtimeData(): Promise<CollectResult> {
  const results = await Promise.allSettled(
    REALTIME_SYMBOLS.map((s) => fetchQuote(s.yahoo).then((q) => ({ ...s, quote: q })))
  );

  const updated: string[] = [];
  const failed: string[] = [];
  const values: Record<string, number> = {};

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value.quote) {
      const idx = results.indexOf(result);
      failed.push(REALTIME_SYMBOLS[idx]?.type ?? "unknown");
      continue;
    }

    const { type, dp, quote } = result.value;
    const rounded = parseFloat(quote.price.toFixed(dp));
    const marketTime = quote.marketTime;

    // marketTime 기준 UTC 날짜 범위 계산
    const dayStr  = marketTime.toISOString().slice(0, 10);
    const dayStart = new Date(dayStr + "T00:00:00.000Z");
    const dayEnd   = new Date(dayStr + "T23:59:59.999Z");

    // 해당 날짜에 이미 레코드가 있는지 확인
    const existing = await prisma.indicatorRecord.findFirst({
      where: { type, recordedAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { recordedAt: "desc" },
    });

    if (existing) {
      // 값이 다를 때만 업데이트 (미세 오차 무시)
      if (Math.abs(existing.value - rounded) > rounded * 0.0001) {
        await prisma.indicatorRecord.update({
          where: { id: existing.id },
          data: { value: rounded, recordedAt: marketTime },
        });
        values[type] = rounded;
        updated.push(type);
      }
      // 값이 같으면 DB 불필요 — 그래도 values에 추가 (UI 표시용)
      values[type] = rounded;
    } else {
      // 새 레코드 삽입 (실제 거래 시각을 recordedAt으로 사용)
      await prisma.indicatorRecord.create({
        data: { type, value: rounded, recordedAt: marketTime },
      });
      values[type] = rounded;
      updated.push(type);
    }
  }

  return {
    success: Object.keys(values).length > 0,
    updated,
    failed,
    values,
    error: failed.length > 0 ? `${failed.length}개 지표 수집 실패` : undefined,
  };
}

export async function getLastUpdated(): Promise<Date | null> {
  const r = await prisma.indicatorRecord.findFirst({
    where: { type: "KOSPI" },
    orderBy: { recordedAt: "desc" },
  });
  return r?.recordedAt ?? null;
}

// ── 3년 히스토리 수집 ────────────────────────────────────────

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

  if (!res.ok) return [];

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

export interface HistoryCollectResult {
  success: boolean;
  summary: { type: string; points: number }[];
  errors: string[];
}

export async function collectHistoricalData(): Promise<HistoryCollectResult> {
  const summary: { type: string; points: number }[] = [];
  const errors: string[] = [];

  for (const { type, yahoo, dp } of REALTIME_SYMBOLS) {
    const points = await fetchHistory(yahoo, dp);

    if (points.length === 0) {
      errors.push(`${type}: 데이터 없음`);
      continue;
    }

    // 기존 해당 타입 전체 삭제 후 재삽입
    await prisma.$transaction([
      prisma.indicatorRecord.deleteMany({ where: { type } }),
      prisma.indicatorRecord.createMany({
        data: points.map((p) => ({
          type,
          value: p.value,
          recordedAt: p.date,
        })),
      }),
    ]);

    summary.push({ type, points: points.length });
  }

  return { success: summary.length > 0, summary, errors };
}
