import { prisma } from "./prisma";
import { mapMissingDartCodes } from "./dart-corp";

const DART_BASE  = "https://opendart.fss.or.kr/api";
// 동시 처리할 종목 수.
// 종목당: 연도별로 [주요계정 + alotMatter + 발행주식수 + 전체계정(현금)] = 4개 API 호출.
// 연도는 순차 처리하므로 동시 요청 상한 ≈ CONCURRENCY×4 = 16 (SQLite/Postgres ~20 한계 이내).
const CONCURRENCY = 4;
// 웨이브(동시 묶음) 간 간격 — DART 부하 분산용
const WAVE_DELAY  = 300;
// 종목당 연도 루프 사이 간격 — DART rate limit 분산 (3개년 수집 시 호출량 3배)
const YEAR_DELAY  = 200;
// 수집 대상 연도 수 (EPS 3년 CAGR·마진 추이용 시계열)
const YEARS_BACK  = 3;

const REVENUE_KEYWORDS          = ["매출액", "수익(매출액)", "영업수익", "매출"];
const REVENUE_FINANCIAL_KEYWORDS = ["이자수익"];   // 금융·보험사 폴백
const OP_PROFIT_KEYWORDS         = ["영업이익"];
const NET_INCOME_KEYWORDS        = ["당기순이익"];

// 현금및현금성자산 (전체재무제표 fnlttSinglAcntAll). 표기 변형 대응:
// account_id 우선(IFRS 표준코드), 없으면 account_nm 포함 매칭.
const CASH_ACCOUNT_IDS   = ["ifrs-full_CashAndCashEquivalents", "ifrs_CashAndCashEquivalents"];
const CASH_NAME_KEYWORDS = ["현금및현금성자산", "현금및현금 성자산", "현금 및 현금성자산"];

interface DartItem {
  sj_div:        string;
  account_nm:    string;
  thstrm_amount: string;
  frmtrm_amount: string;
}

// 전체재무제표(fnlttSinglAcntAll)는 account_id(IFRS 표준코드)를 추가로 제공.
interface DartAllItem {
  sj_div:        string;
  account_id:    string;
  account_nm:    string;
  thstrm_amount: string;
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

/**
 * BS 계정(자본총계·부채총계) 행 탐색.
 * 1순위: account_nm 정확일치. 실패 시 includes() 폴백 (IFRS 변형 표기 대응:
 * "지배기업 소유주에게 귀속되는 자본총계" 등). 오매칭 방지를 위해 excludeKw 적용.
 * 폴백 진입 시 운영 모니터링용 경고 로그를 남긴다.
 */
function findBsAccount(
  items: DartItem[],
  exactName: string,
  includeKw: string,
  excludeKw: string[],
  ctx: { stockId: string; period: string; label: string },
): DartItem | undefined {
  const bsRows = items.filter((i) => i.sj_div === "BS");
  // 1순위: 정확일치
  const exact = bsRows.find((i) => i.account_nm === exactName);
  if (exact) return exact;
  // 폴백: includes() (제외 키워드로 오매칭 차단)
  const fuzzy = bsRows.find((i) => {
    const nm = i.account_nm ?? "";
    return nm.includes(includeKw) && !excludeKw.some((ex) => nm.includes(ex));
  });
  if (fuzzy) {
    console.warn(
      `[dart-collector] BS 정확일치 실패 → includes 폴백: ${ctx.label} (${ctx.stockId} ${ctx.period}) account_nm="${fuzzy.account_nm}"`,
    );
  }
  return fuzzy;
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

/**
 * fnlttSinglAcntAll: 전체재무제표 — 현금및현금성자산(BS) 추출용.
 * 주요계정(fnlttSinglAcnt)에는 현금 항목이 없어 전체계정 API를 별도 호출한다.
 * 반환: 현금및현금성자산 (억원 단위 — processYear에서 추가 변환 불필요) 또는 null.
 */
async function fetchCash(dartCode: string, year: number): Promise<number | null> {
  const key = dartKey();
  // CFS(연결) 우선, 없으면 OFS(별도). sj_div=BS, fs_div=재무제표구분.
  for (const fsDiv of ["CFS", "OFS"]) {
    const url = `${DART_BASE}/fnlttSinglAcntAll.json?crtfc_key=${key}&corp_code=${dartCode}&bsns_year=${year}&reprt_code=11011&fs_div=${fsDiv}`;
    let res: Response;
    try { res = await fetch(url, { signal: AbortSignal.timeout(15_000) }); } catch { continue; }
    if (!res.ok) continue;
    let data: { status: string; list?: DartAllItem[] };
    try { data = await res.json(); } catch { continue; }
    if (data.status !== "000" || !(data.list?.length)) continue;

    const bsRows = data.list.filter((i) => i.sj_div === "BS");
    // 1) IFRS account_id 정확 매칭 우선
    let row = bsRows.find((i) => CASH_ACCOUNT_IDS.includes(i.account_id));
    // 2) 폴백: 계정명 포함 매칭 (표기 변형 대응)
    if (!row) {
      row = bsRows.find((i) => {
        const nm = (i.account_nm ?? "").replace(/\s/g, "");
        return CASH_NAME_KEYWORDS.some((kw) => nm.includes(kw.replace(/\s/g, "")));
      });
    }
    // 억원 단위로 반환 (다른 BS 항목 totalDebt/totalEquity와 단위 일관)
    const cash = row ? toEokwon(row.thstrm_amount) : null;
    if (cash != null) return cash;
  }
  return null;
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
export async function collectAllFinancials(
  options?: { offset?: number; limit?: number }
): Promise<CollectFinancialsResult> {
  const key = process.env.DART_API_KEY;
  if (!key) return { success: false, total: 0, updated: 0, failed: [], noDartCode: 0, duration: 0 };

  const start    = Date.now();

  // 첫 배치에서 누락 종목 DART corp_code 자동 매핑 (동적 추가 종목 대응)
  if (!options?.offset) await mapMissingDartCodes();

  const allStocks = await prisma.stock.findMany({ select: { id: true, name: true, dartCode: true }, orderBy: { id: "asc" } });
  const stocks   = options?.offset != null || options?.limit != null
    ? allStocks.slice(options.offset ?? 0, options.limit ? (options.offset ?? 0) + options.limit : undefined)
    : allStocks;
  const total  = stocks.length;
  const failed: string[] = [];
  let updated = 0, noDartCode = 0;

  const now        = new Date();
  // 가장 최근 확정 회계연도. 4월(getMonth()>=3) 이전엔 직전연도 사업보고서 미공시 → 2년 전.
  const latestYear = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
  // 시계열: latestYear, latestYear-1, latestYear-2 (예: 2024A/2023A/2022A)
  const reportYears = Array.from({ length: YEARS_BACK }, (_, k) => latestYear - k);

  /**
   * 단일 종목·단일 연도 처리. 성공 시 upsert 후 true, 데이터 없으면 false.
   * 연도별 호출: 주요계정 + alotMatter + 발행주식수 + 전체계정(현금) = 4 동시 요청.
   */
  async function processYear(stockId: string, dartCode: string, year: number): Promise<boolean> {
    const [items, alotItems, totalShares, cash] = await Promise.all([
      fetchYearlyFinancials(dartCode, year),
      fetchAlotMatter(dartCode, year),
      fetchShares(dartCode, year),
      fetchCash(dartCode, year), // 억원 단위
    ]);

    if (items.length === 0) return false;

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

    // ── 재무상태표(BS): 부채총계·자본총계 (주요계정에 포함) ─
    // 정확일치 우선, 실패 시 IFRS 변형 표기를 includes()로 폴백 매칭.
    // 자본총계: "이익잉여금" 등 부분합 행 오매칭 차단. 부채총계: "유동/비유동부채" 차단.
    const period   = `${year}A`;
    const equityRow  = findBsAccount(items, "자본총계", "자본총계", ["이익잉여금", "자본금"], { stockId, period, label: "자본총계" });
    const debtRow    = findBsAccount(items, "부채총계", "부채총계", ["유동부채", "비유동부채"], { stockId, period, label: "부채총계" });
    const equityWon  = equityRow ? parseFloat(equityRow.thstrm_amount.replace(/,/g, "")) : null;
    const totalEquity = toEokwon(equityRow?.thstrm_amount ?? "");
    const totalDebt   = toEokwon(debtRow?.thstrm_amount ?? "");
    // cash는 fetchCash가 이미 억원 단위로 반환 (추가 변환 불필요)

    // ── BPS: 자본총계 / 발행주식수 ───────────────────────
    const bps        = equityWon && totalShares && totalShares > 0
      ? Math.round(equityWon / totalShares) : null;

    // ── EPS / DPS from alotMatter ────────────────────────
    const epsRow = alotItems.find((i) => i.se?.includes("주당순이익"));
    const dpsRow = alotItems.find((i) =>
      i.se?.includes("주당 현금배당금") && i.stock_knd === "보통주"
    );
    const eps = epsRow ? toWon(epsRow.thstrm) : null;
    const dps = dpsRow ? toWon(dpsRow.thstrm) : null;

    const fields = {
      revenue, operatingProfit: opProfit, netIncome,
      revenueGrowth: growth(revenue, revPrev),
      opGrowth:      growth(opProfit, opPrev),
      netGrowth:     growth(netIncome, netPrev),
      opMargin, eps, bps, dps,
      totalDebt, totalEquity, cash,
    };

    await prisma.stockFinancial.upsert({
      where:  { stockId_period: { stockId, period } },
      create: { stockId, period, ...fields },
      update: fields,
    });

    return true;
  }

  // 단일 종목 처리 — 최근 3개년을 순차 수집 (연도 간 YEAR_DELAY 슬립으로 rate limit 분산).
  // 최신 연도에서 데이터가 전혀 없으면 상장 폐지/신규상장 등으로 보고 failed 처리.
  async function processOne(stock: { id: string; dartCode: string | null }): Promise<"updated" | "failed" | "noDart"> {
    if (!stock.dartCode) return "noDart";

    let anyYear = false;
    for (let y = 0; y < reportYears.length; y++) {
      const ok = await processYear(stock.id, stock.dartCode, reportYears[y]).catch(() => false);
      anyYear = anyYear || ok;
      // 최신 연도(첫 루프)에서 실패하면 과거 연도도 대개 없음 → 조기 종료로 호출 절약
      if (y === 0 && !ok) break;
      if (y + 1 < reportYears.length) await sleep(YEAR_DELAY);
    }

    return anyYear ? "updated" : "failed";
  }

  // CONCURRENCY개씩 동시 처리 (종목당 700ms 순차 대기 제거)
  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const wave = stocks.slice(i, i + CONCURRENCY);
    const statuses = await Promise.all(
      wave.map((stock) => processOne(stock).catch(() => "failed" as const))
    );
    statuses.forEach((status, k) => {
      if (status === "updated")      updated++;
      else if (status === "noDart")  noDartCode++;
      else                            failed.push(wave[k].id);
    });
    if (i + CONCURRENCY < stocks.length) await sleep(WAVE_DELAY);
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
