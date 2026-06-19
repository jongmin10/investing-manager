import { prisma } from "./prisma";

const DART_BASE  = "https://opendart.fss.or.kr/api";
const CALL_DELAY = 700;

const REVENUE_KEYWORDS          = ["매출액", "수익(매출액)", "영업수익", "매출"];
const REVENUE_FINANCIAL_KEYWORDS = ["이자수익"];   // 금융·보험사 폴백
const OP_PROFIT_KEYWORDS         = ["영업이익"];
const NET_INCOME_KEYWORDS        = ["당기순이익"];

interface DartItem {
  sj_div:        string;
  account_nm:    string;
  thstrm_amount: string;
  frmtrm_amount: string;
}

interface AlotItem {
  se:        string;
  stock_knd: string;
  thstrm:    string;
}

interface ShareItem {
  se:           string;
  istc_totqy:   string;
}

export interface CollectFinancialsResult {
  success: boolean; total: number; updated: number;
  failed: string[]; noDartCode: number; duration: number;
}

// ── 유틸 ─────────────────────────────────────────────────
const GROWTH_BASE_MIN = 50; // 기준연도 절댓값 < 50억 시 성장률 null

function toEokwon(s: string): number | null {
  if (!s || s.trim() === "" || s === "-") return null;
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isNaN(n) ? null : parseFloat((n / 100_000_000).toFixed(1));
}

function toWon(s: string): number | null {
  if (!s || s.trim() === "" || s === "-") return null;
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isNaN(n) ? null : Math.round(n);
}

function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  if (Math.abs(prev) < GROWTH_BASE_MIN) return null;
  return parseFloat(((cur - prev) / Math.abs(prev) * 100).toFixed(1));
}

function findAccount(items: DartItem[], keywords: string[]): DartItem | undefined {
  return items.find(
    (item) => item.sj_div === "IS" && keywords.some((kw) => item.account_nm.includes(kw))
  );
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function dartKey() {
  const k = process.env.DART_API_KEY;
  if (!k) throw new Error("DART_API_KEY 환경변수가 설정되지 않았습니다.");
  return k;
}

// ── DART API 호출 ─────────────────────────────────────────

async function fetchYearlyFinancials(dartCode: string, year: number): Promise<DartItem[]> {
  const key = dartKey();
  for (const fsDiv of ["CFS", "OFS"]) {
    const url = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${key}&corp_code=${dartCode}&bsns_year=${year}&reprt_code=11011&fs_div=${fsDiv}`;
    let res: Response;
    try { res = await fetch(url, { signal: AbortSignal.timeout(15_000) }); } catch { continue; }
    if (!res.ok) continue;
    let data: { status: string; list?: DartItem[] };
    try { data = await res.json(); } catch { continue; }
    if (data.status === "000" && (data.list?.length ?? 0) > 0) return data.list!;
  }
  return [];
}

/** alotMatter: EPS(연결주당순이익) + DPS(주당현금배당금) */
async function fetchAlotMatter(dartCode: string, year: number): Promise<AlotItem[]> {
  const url = `${DART_BASE}/alotMatter.json?crtfc_key=${dartKey()}&corp_code=${dartCode}&bsns_year=${year}&reprt_code=11011`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const d: { status: string; list?: AlotItem[] } = await res.json();
    return d.status === "000" ? (d.list ?? []) : [];
  } catch { return []; }
}

/** stockTotqySttus: 보통주 발행주식총수 */
async function fetchShares(dartCode: string, year: number): Promise<number | null> {
  const url = `${DART_BASE}/stockTotqySttus.json?crtfc_key=${dartKey()}&corp_code=${dartCode}&bsns_year=${year}&reprt_code=11011`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const d: { status: string; list?: ShareItem[] } = await res.json();
    if (d.status !== "000") return null;
    // "보통주" 또는 "의결권 있는 주식" (셀트리온 등 일부 기업)
    const row = (d.list ?? []).find((r) =>
      r.se === "보통주" || r.se === "의결권 있는 주식"
    );
    return row ? toWon(row.istc_totqy) : null;
  } catch { return null; }
}

// ── 전 종목 재무 수집 ─────────────────────────────────────
export async function collectAllFinancials(): Promise<CollectFinancialsResult> {
  const key = process.env.DART_API_KEY;
  if (!key) return { success: false, total: 0, updated: 0, failed: [], noDartCode: 0, duration: 0 };

  const start  = Date.now();
  const stocks = await prisma.stock.findMany({ select: { id: true, name: true, dartCode: true } });
  const total  = stocks.length;
  const failed: string[] = [];
  let updated = 0, noDartCode = 0;

  const now        = new Date();
  const reportYear = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;

  for (const stock of stocks) {
    if (!stock.dartCode) { noDartCode++; continue; }

    // 3개 API 병렬 호출로 시간 단축
    const [items, alotItems, totalShares] = await Promise.all([
      fetchYearlyFinancials(stock.dartCode, reportYear),
      fetchAlotMatter(stock.dartCode, reportYear),
      fetchShares(stock.dartCode, reportYear),
    ]);

    if (items.length === 0) { failed.push(stock.id); await sleep(300); continue; }

    // ── 손익계산서 ────────────────────────────────────────
    // 금융·보험사는 "매출액" 대신 "이자수익"으로 폴백
    const revRow  = findAccount(items, REVENUE_KEYWORDS)
                 ?? findAccount(items, REVENUE_FINANCIAL_KEYWORDS);
    const opRow   = findAccount(items, OP_PROFIT_KEYWORDS);
    const netRow  = findAccount(items, NET_INCOME_KEYWORDS);

    const revenue   = toEokwon(revRow?.thstrm_amount ?? "");
    const revPrev   = toEokwon(revRow?.frmtrm_amount ?? "");
    const opProfit  = toEokwon(opRow?.thstrm_amount  ?? "");
    const opPrev    = toEokwon(opRow?.frmtrm_amount  ?? "");
    const netIncome = toEokwon(netRow?.thstrm_amount ?? "");
    const netPrev   = toEokwon(netRow?.frmtrm_amount ?? "");

    const opMargin  = revenue && revenue > 0 && opProfit != null
      ? parseFloat((opProfit / revenue * 100).toFixed(1)) : null;

    // ── BPS: 자본총계 / 발행주식수 ───────────────────────
    // CFS 자본총계는 목록에서 첫 번째로 나오는 자본총계 (연결)
    const equityRow  = items.find((i) => i.sj_div === "BS" && i.account_nm === "자본총계");
    const equityWon  = equityRow ? parseFloat(equityRow.thstrm_amount.replace(/,/g, "")) : null;
    const bps        = equityWon && totalShares && totalShares > 0
      ? Math.round(equityWon / totalShares) : null;

    // ── EPS / DPS from alotMatter ────────────────────────
    const epsRow = alotItems.find((i) => i.se?.includes("주당순이익"));
    const dpsRow = alotItems.find((i) =>
      i.se?.includes("주당 현금배당금") && i.stock_knd === "보통주"
    );
    const eps = epsRow ? toWon(epsRow.thstrm) : null;
    const dps = dpsRow ? toWon(dpsRow.thstrm) : null;

    const period = `${reportYear}A`;

    await prisma.stockFinancial.upsert({
      where:  { stockId_period: { stockId: stock.id, period } },
      create: {
        stockId: stock.id, period,
        revenue, operatingProfit: opProfit, netIncome,
        revenueGrowth: growth(revenue, revPrev),
        opGrowth:      growth(opProfit, opPrev),
        netGrowth:     growth(netIncome, netPrev),
        opMargin, eps, bps, dps,
      },
      update: {
        revenue, operatingProfit: opProfit, netIncome,
        revenueGrowth: growth(revenue, revPrev),
        opGrowth:      growth(opProfit, opPrev),
        netGrowth:     growth(netIncome, netPrev),
        opMargin, eps, bps, dps,
      },
    });

    updated++;
    await sleep(CALL_DELAY);
  }

  return { success: updated > 0, total, updated, failed, noDartCode, duration: Date.now() - start };
}

// ── 상태 조회 ─────────────────────────────────────────────
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
