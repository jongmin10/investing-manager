import { prisma } from "./prisma";
import { loggedFetch } from "./logged-fetch";

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

// ── FX(KRW/USD) 이상치 판정 (범위 밴드 + 급변 필터) ──────────────────────────
// Yahoo KRW=X 이력에 간헐적 글리치(예: 잘못된 틱으로 누적 134만% 스파이크)가 있어,
// 해외 ETF 원화환산·환율 지표를 오염시킨다. 수집·백필 공통으로 아래 판정을 통과한 값만 적재한다.
// 기준: 2003~ 실측 KRW/USD 범위(~900~1600)를 넉넉히 감싸는 밴드 + 직전 대비 20% 초과 급변 제외.
export const FX_MIN = 800;
export const FX_MAX = 2500;
export const FX_MAX_JUMP = 0.2; // 직전 관측 대비 허용 변동률
export function isPlausibleKrwUsd(value: number, prev?: number | null): boolean {
  if (!Number.isFinite(value) || value < FX_MIN || value > FX_MAX) return false;
  if (prev != null && prev > 0 && Math.abs(value - prev) / prev > FX_MAX_JUMP) return false;
  return true;
}

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

  const res = await loggedFetch(url, {
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

    // KRW_USD 이상치(글리치) 게이트 — 직전 관측 대비 급변/범위 이탈이면 적재하지 않는다.
    if (type === "KRW_USD") {
      const prev = await prisma.indicatorRecord.findFirst({
        where: { type: "KRW_USD" },
        orderBy: { recordedAt: "desc" },
      });
      if (!isPlausibleKrwUsd(rounded, prev?.value ?? null)) {
        failed.push(type);
        continue;
      }
    }

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

// ── 지수 일봉 종가 라이브 갱신 (DailyIndexPrice, 스펙 §5 "월 라이브 갱신") ──
// 월수익률/MDD 원천 테이블에 당일 거래일 1행을 upsert 한다. 조회 시 월말 리샘플링이므로
// 월말 별도 처리 불필요 — 매일 최신 거래일 close 만 채워두면 항상 최신 월말 종가가 도출된다.
// DOW(^DJI)·NASDAQ 종합(^IXIC)은 REALTIME_SYMBOLS 에 없어 여기서 전용 매핑으로 5종을 수집한다.
const DAILY_INDEX_SYMBOLS = [
  { series: "KOSPI",  yahoo: "^KS11",  dp: 2 },
  { series: "KOSDAQ", yahoo: "^KQ11",  dp: 2 },
  { series: "DOW",    yahoo: "^DJI",   dp: 2 },
  { series: "SP500",  yahoo: "^GSPC",  dp: 2 },
  { series: "NASDAQ", yahoo: "^IXIC",  dp: 2 },
] as const;

interface DailyClose {
  date: Date; // 거래일 UTC 자정 정규화 (거래소 로컬일 기준, gmtoffset 반영)
  close: number;
}

// 거래소 로컬 벽시계 기준 거래일의 UTC 자정으로 정규화 (백필 스크립트와 동일 원칙, 월 경계 밀림 방지)
async function fetchDailyClose(yahoo: string, dp: number): Promise<DailyClose | null> {
  const encoded = encodeURIComponent(yahoo);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d&includePrePost=false`;

  const res = await loggedFetch(url, {
    headers: YF_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const ts = meta?.regularMarketTime; // Unix seconds
  if (typeof price !== "number" || typeof ts !== "number") return null;

  const gmtoffset: number = meta?.gmtoffset ?? 0; // 초
  const local = new Date((ts + gmtoffset) * 1000);
  const dayStr = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(
    local.getUTCDate()
  ).padStart(2, "0")}`;
  return { date: new Date(`${dayStr}T00:00:00.000Z`), close: parseFloat(price.toFixed(dp)) };
}

export interface DailyIndexResult {
  updated: string[];
  failed: string[];
}

export async function collectDailyIndexPrices(): Promise<DailyIndexResult> {
  const results = await Promise.allSettled(
    DAILY_INDEX_SYMBOLS.map((s) => fetchDailyClose(s.yahoo, s.dp).then((d) => ({ series: s.series, daily: d })))
  );

  const updated: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value.daily) {
      failed.push(DAILY_INDEX_SYMBOLS[i].series);
      continue;
    }
    const { series, daily } = r.value;
    await prisma.dailyIndexPrice.upsert({
      where: { series_date: { series, date: daily.date } },
      create: { series, date: daily.date, close: daily.close },
      update: { close: daily.close },
    });
    updated.push(series);
  }

  return { updated, failed };
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

  const res = await loggedFetch(url, {
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
