import { prisma } from "./prisma";

const DART_BASE  = "https://opendart.fss.or.kr/api";
const CALL_DELAY = 700; // ms — DART API rate limit 대응

// ── 계정명 키워드 ─────────────────────────────────────────
const REVENUE_KEYWORDS    = ["매출액", "수익(매출액)", "영업수익", "매출"];
const OP_PROFIT_KEYWORDS  = ["영업이익"];
const NET_INCOME_KEYWORDS = ["당기순이익"];

interface DartItem {
  sj_div:          string; // IS=손익계산서, BS=재무상태표
  account_nm:      string;
  thstrm_amount:   string; // 당기 금액
  frmtrm_amount:   string; // 전기 금액
}

interface DartResponse {
  status:  string;
  message: string;
  list?:   DartItem[];
}

export interface CollectFinancialsResult {
  success:    boolean;
  total:      number;
  updated:    number;
  failed:     string[];
  noDartCode: number;
  duration:   number;
}

// ── 유틸 ─────────────────────────────────────────────────
function toEokwon(str: string): number | null {
  if (!str || str.trim() === "" || str === "-") return null;
  const n = parseFloat(str.replace(/,/g, "").trim());
  return isNaN(n) ? null : parseFloat((n / 100_000_000).toFixed(1));
}

function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return parseFloat(((cur - prev) / Math.abs(prev) * 100).toFixed(1));
}

function findAccount(items: DartItem[], keywords: string[]): DartItem | undefined {
  // IS(손익) 항목 중 keywords를 포함하는 첫 번째 항목 반환
  return items.find(
    (item) => item.sj_div === "IS" &&
      keywords.some((kw) => item.account_nm.includes(kw))
  );
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── DART 연간 재무제표 단건 조회 ─────────────────────────
async function fetchYearlyFinancials(dartCode: string, year: number): Promise<DartItem[]> {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 환경변수가 설정되지 않았습니다.");

  // 연결재무제표(CFS) 우선, 없으면 별도(OFS)
  for (const fsDiv of ["CFS", "OFS"]) {
    const url =
      `${DART_BASE}/fnlttSinglAcnt.json` +
      `?crtfc_key=${key}` +
      `&corp_code=${dartCode}` +
      `&bsns_year=${year}` +
      `&reprt_code=11011` + // 사업보고서
      `&fs_div=${fsDiv}`;

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      continue;
    }
    if (!res.ok) continue;

    let data: DartResponse;
    try { data = await res.json(); } catch { continue; }

    if (data.status === "000" && (data.list?.length ?? 0) > 0) {
      return data.list!;
    }
  }
  return [];
}

// ── 전 종목 재무 수집 ─────────────────────────────────────
export async function collectAllFinancials(): Promise<CollectFinancialsResult> {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return { success: false, total: 0, updated: 0, failed: [], noDartCode: 0, duration: 0 };
  }

  const start = Date.now();

  const stocks = await prisma.stock.findMany({
    select: { id: true, name: true, dartCode: true },
  });

  const total = stocks.length;
  const failed: string[] = [];
  let updated    = 0;
  let noDartCode = 0;

  // 최신 사업보고서 연도 (보통 전년도 — 당해 사업보고서는 3월 이후 공시)
  const now         = new Date();
  const reportYear  = now.getMonth() >= 3               // 4월 이후면 전전년도도 있을 수 있으나 전년도 우선
    ? now.getFullYear() - 1
    : now.getFullYear() - 2;

  for (const stock of stocks) {
    if (!stock.dartCode) {
      noDartCode++;
      continue;
    }

    const items = await fetchYearlyFinancials(stock.dartCode, reportYear);
    if (items.length === 0) {
      failed.push(stock.id);
      await sleep(300);
      continue;
    }

    // 주요 계정 탐색
    const revRow  = findAccount(items, REVENUE_KEYWORDS);
    const opRow   = findAccount(items, OP_PROFIT_KEYWORDS);
    const netRow  = findAccount(items, NET_INCOME_KEYWORDS);

    const revenue   = toEokwon(revRow?.thstrm_amount ?? "");
    const revPrev   = toEokwon(revRow?.frmtrm_amount ?? "");
    const opProfit  = toEokwon(opRow?.thstrm_amount  ?? "");
    const opPrev    = toEokwon(opRow?.frmtrm_amount  ?? "");
    const netIncome = toEokwon(netRow?.thstrm_amount ?? "");
    const netPrev   = toEokwon(netRow?.frmtrm_amount ?? "");

    const opMargin = revenue && revenue > 0 && opProfit != null
      ? parseFloat((opProfit / revenue * 100).toFixed(1))
      : null;

    const period = `${reportYear}A`;

    await prisma.stockFinancial.upsert({
      where:  { stockId_period: { stockId: stock.id, period } },
      create: {
        stockId: stock.id,
        period,
        revenue,
        operatingProfit: opProfit,
        netIncome,
        revenueGrowth:   growth(revenue, revPrev),
        opGrowth:        growth(opProfit, opPrev),
        netGrowth:       growth(netIncome, netPrev),
        opMargin,
      },
      update: {
        revenue,
        operatingProfit: opProfit,
        netIncome,
        revenueGrowth:   growth(revenue, revPrev),
        opGrowth:        growth(opProfit, opPrev),
        netGrowth:       growth(netIncome, netPrev),
        opMargin,
      },
    });

    updated++;
    await sleep(CALL_DELAY);
  }

  return {
    success: updated > 0,
    total,
    updated,
    failed,
    noDartCode,
    duration: Date.now() - start,
  };
}

// ── 재무 수집 상태 조회 ───────────────────────────────────
export async function getFinancialStatus() {
  const [withDart, withoutDart, financialCount, latest] = await Promise.all([
    prisma.stock.count({ where: { dartCode: { not: null } } }),
    prisma.stock.count({ where: { dartCode: null } }),
    prisma.stockFinancial.count(),
    prisma.stockFinancial.findFirst({ orderBy: { id: "desc" }, select: { period: true } }),
  ]);

  return {
    stocksWithDartCode:    withDart,
    stocksWithoutDartCode: withoutDart,
    financialCount,
    lastPeriod: latest?.period ?? null,
    hasDartKey: !!process.env.DART_API_KEY,
  };
}
