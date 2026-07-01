import { prisma } from "@/lib/prisma";

// 지원 시리즈 5종 (스펙 §5 확정). Yahoo 심볼은 백필 스크립트가 소유.
export const MONTHLY_SERIES = ["KOSPI", "KOSDAQ", "DOW", "SP500", "NASDAQ"] as const;
export type MonthlySeries = (typeof MONTHLY_SERIES)[number];

export const DEFAULT_FROM = "2000-01";

export function isMonthlySeries(v: string): v is MonthlySeries {
  return (MONTHLY_SERIES as readonly string[]).includes(v);
}

// "YYYY-MM" 형식 검증
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function isValidYearMonth(v: string): boolean {
  return YM_RE.test(v);
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MonthlyRow {
  yearMonth: string;
  close: number;
  returnPct: number | null;
}

export interface MddResult {
  pct: number; // 최대낙폭(음수 %), 예: -54.5
  peak: string; // "YYYY-MM-DD" 직전 고점 일자
  trough: string; // "YYYY-MM-DD" 저점 일자
}

export interface MonthlySummary {
  cagrPct: number | null;
  bestMonth: { ym: string; r: number } | null;
  worstMonth: { ym: string; r: number } | null;
  positiveRatio: number | null;
  mdd: MddResult | null; // 일봉 종가 기준 최대낙폭 (데이터 2개 미만이면 null)
}

export interface MonthlyReturnsResponse {
  series: MonthlySeries;
  firstAvailable: string | null; // 소스가 제공하는 최초월 (from/to 필터와 무관, DB 기준)
  rows: MonthlyRow[];
  summary: MonthlySummary;
}

// 누적 수익률 차트용 시계열. 구간이 짧으면 일단위, 길면 월단위로 적응.
export type ChartGranularity = "daily" | "monthly";
export interface ChartPoint {
  t: string; // 일단위="YYYY-MM-DD", 월단위="YYYY-MM"
  close: number;
}
export interface ChartSeries {
  granularity: ChartGranularity;
  points: ChartPoint[];
}
// 일단위로 렌더할 최대 포인트 수(≈3.2년 거래일). 초과 구간은 월말 리샘플링으로 폴백.
export const CHART_DAILY_MAX_POINTS = 800;

// from/to("YYYY-MM") → [월초, 다음달1일) UTC 범위. 저장 date(UTC 자정)와 정합.
function monthRangeUtc(from: string, to: string): { start: Date; endExcl: Date } {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return {
    start: new Date(Date.UTC(fy, fm - 1, 1)),
    endExcl: new Date(Date.UTC(tm === 12 ? ty + 1 : ty, tm === 12 ? 0 : tm, 1)),
  };
}

// 거래일 date → "YYYY-MM" (백필이 UTC 자정 정규화해 저장하므로 UTC getter 사용)
function ymOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 거래일 date → "YYYY-MM-DD" (UTC)
function ymdOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 요약 통계 산출.
 * - cagrPct: 구간 첫/마지막 종가 기준 연복리. 개월수/12 를 연수로 사용.
 * - bestMonth/worstMonth: returnPct 최대/최소 (null 제외).
 * - positiveRatio: returnPct>0 비율 (null 제외 모수).
 */
function buildSummary(rows: MonthlyRow[]): Omit<MonthlySummary, "mdd"> {
  const withReturn = rows.filter((r): r is MonthlyRow & { returnPct: number } => r.returnPct != null);

  let best: { ym: string; r: number } | null = null;
  let worst: { ym: string; r: number } | null = null;
  let positives = 0;
  for (const r of withReturn) {
    if (best === null || r.returnPct > best.r) best = { ym: r.yearMonth, r: r.returnPct };
    if (worst === null || r.returnPct < worst.r) worst = { ym: r.yearMonth, r: r.returnPct };
    if (r.returnPct > 0) positives++;
  }
  const positiveRatio = withReturn.length > 0 ? parseFloat((positives / withReturn.length).toFixed(4)) : null;

  // CAGR: 구간 종가 스팬. 최소 2개 행 + 12개월 이상일 때만 의미.
  let cagrPct: number | null = null;
  if (rows.length >= 2) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    // 개월수 = (연차*12 + 월차)
    const [fy, fm] = first.yearMonth.split("-").map(Number);
    const [ly, lm] = last.yearMonth.split("-").map(Number);
    const months = (ly - fy) * 12 + (lm - fm);
    if (first.close > 0 && months > 0) {
      const years = months / 12;
      cagrPct = parseFloat(((Math.pow(last.close / first.close, 1 / years) - 1) * 100).toFixed(2));
    }
  }

  return { cagrPct, bestMonth: best, worstMonth: worst, positiveRatio };
}

/**
 * MDD(최대낙폭) — 일봉 종가 기준 (스펙 §1).
 *   mdd = min_t( close_t / running_max(close_≤t) − 1 )
 * running_max 갱신 지점을 peak, 최소 낙폭 발생 지점을 trough 로 기록한다.
 * 데이터 2개 미만이면 null.
 */
function computeMdd(daily: { date: Date; close: number }[]): MddResult | null {
  if (daily.length < 2) return null;

  let runningMax = daily[0].close;
  let runningMaxDate = daily[0].date;
  let mddPct = 0; // 낙폭 없음(0)에서 시작 → 항상 하락분만 갱신
  let peakDate = daily[0].date;
  let troughDate = daily[0].date;

  for (const p of daily) {
    if (p.close > runningMax) {
      runningMax = p.close;
      runningMaxDate = p.date;
    }
    if (runningMax > 0) {
      const drawdown = p.close / runningMax - 1; // ≤ 0
      if (drawdown < mddPct) {
        mddPct = drawdown;
        peakDate = runningMaxDate;
        troughDate = p.date;
      }
    }
  }

  return {
    pct: parseFloat((mddPct * 100).toFixed(2)),
    peak: ymdOf(peakDate),
    trough: ymdOf(troughDate),
  };
}

/**
 * 지수 월별 수익률 조회. from/to 는 "YYYY-MM"(포함). rows 는 yearMonth 오름차순.
 *
 * 처리(스펙 §5): DailyIndexPrice 에서 [from월초, to월말] 일봉을 읽어
 *   1) 각 (연-월) 마지막 거래일 close = 월말 종가 시계열 구성,
 *   2) 인접 월 종가비로 returnPct(첫 행 null),
 *   3) buildSummary(cagr·best·worst·positiveRatio) + computeMdd(일봉 종가 기준) 산출.
 */
export async function getMonthlyReturns(
  series: MonthlySeries,
  from: string,
  to: string
): Promise<MonthlyReturnsResponse> {
  // from 월초 ~ to 월말(다음달 1일 미만) 범위. UTC 자정 정규화된 date 와 정합.
  const { start: rangeStart, endExcl: rangeEndExcl } = monthRangeUtc(from, to);

  const [daily, firstRow] = await Promise.all([
    prisma.dailyIndexPrice.findMany({
      where: { series, date: { gte: rangeStart, lt: rangeEndExcl } },
      orderBy: { date: "asc" },
      select: { date: true, close: true },
    }),
    prisma.dailyIndexPrice.findFirst({
      where: { series },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  // 월말 리샘플링: 각 (연-월)의 마지막 거래일 close. daily 가 오름차순이므로 덮어쓰면 마지막이 남는다.
  const lastCloseByMonth = new Map<string, number>();
  for (const p of daily) {
    lastCloseByMonth.set(ymOf(p.date), p.close);
  }

  const months = [...lastCloseByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const rows: MonthlyRow[] = months.map(([yearMonth, close], i) => {
    const prev = i > 0 ? months[i - 1][1] : null;
    const returnPct =
      prev != null && prev !== 0 ? parseFloat((((close - prev) / prev) * 100).toFixed(2)) : null;
    return { yearMonth, close, returnPct };
  });

  return {
    series,
    firstAvailable: firstRow ? ymOf(firstRow.date) : null,
    rows,
    summary: { ...buildSummary(rows), mdd: computeMdd(daily) },
  };
}

/**
 * 누적 수익률 차트용 시계열 조회 (기간 적응 해상도).
 *   - [from월초, to월말] 일봉을 읽어 거래일 수가 CHART_DAILY_MAX_POINTS 이하이면
 *     일단위(daily) 그대로, 초과하면 월말 리샘플링(monthly)으로 반환.
 *   - 정규화(시작=100)는 렌더 측(CumulativeChart)에서 수행. 여기선 close 원값만 제공.
 *   - "특정 달"처럼 좁은 구간을 고르면 자동으로 일단위가 되어 월중 움직임이 보인다.
 */
export async function getChartSeries(
  series: MonthlySeries,
  from: string,
  to: string
): Promise<ChartSeries> {
  const { start, endExcl } = monthRangeUtc(from, to);
  const daily = await prisma.dailyIndexPrice.findMany({
    where: { series, date: { gte: start, lt: endExcl } },
    orderBy: { date: "asc" },
    select: { date: true, close: true },
  });

  if (daily.length <= CHART_DAILY_MAX_POINTS) {
    return {
      granularity: "daily",
      points: daily.map((p) => ({ t: ymdOf(p.date), close: p.close })),
    };
  }

  // 월말 리샘플링(각 연-월 마지막 거래일 close). daily 오름차순 → 덮어쓰면 마지막이 남는다.
  const lastCloseByMonth = new Map<string, number>();
  for (const p of daily) lastCloseByMonth.set(ymOf(p.date), p.close);
  const points = [...lastCloseByMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, close]) => ({ t, close }));

  return { granularity: "monthly", points };
}
