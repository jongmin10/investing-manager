import { prisma } from "./prisma";

// 실시간 수집 대상 지표 — Yahoo Finance 심볼 매핑
export const REALTIME_SYMBOLS = [
  { type: "KOSPI",    yahoo: "^KS11",  dp: 1 },
  { type: "KOSDAQ",   yahoo: "^KQ11",  dp: 2 },
  { type: "SP500",    yahoo: "^GSPC",  dp: 2 },
  { type: "NASDAQ100",yahoo: "^NDX",   dp: 2 },
  { type: "SOX",      yahoo: "^SOX",   dp: 2 },
  { type: "VIX",      yahoo: "^VIX",   dp: 2 },
  { type: "KRW_USD",  yahoo: "KRW=X",  dp: 1 },
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

async function fetchQuote(yahoo: string): Promise<number | null> {
  const encoded = encodeURIComponent(yahoo);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d&includePrePost=false`;

  const res = await fetch(url, {
    headers: YF_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" ? price : null;
}

export async function collectRealtimeData(): Promise<CollectResult> {
  const now = new Date();
  const results = await Promise.allSettled(
    REALTIME_SYMBOLS.map((s) => fetchQuote(s.yahoo).then((v) => ({ ...s, value: v })))
  );

  const updated: string[] = [];
  const failed: string[] = [];
  const values: Record<string, number> = {};
  const records: { type: string; value: number; recordedAt: Date }[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.value !== null) {
      const { type, value, dp } = result.value;
      const rounded = parseFloat(value!.toFixed(dp));
      records.push({ type, value: rounded, recordedAt: now });
      values[type] = rounded;
      updated.push(type);
    } else {
      const idx = results.indexOf(result);
      failed.push(REALTIME_SYMBOLS[idx]?.type ?? "unknown");
    }
  }

  if (records.length > 0) {
    await prisma.indicatorRecord.createMany({ data: records });
  }

  return {
    success: records.length > 0,
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
