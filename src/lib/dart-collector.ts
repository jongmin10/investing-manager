import { prisma } from "./prisma";
import { mapMissingDartCodes } from "./dart-corp";

const DART_BASE  = "https://opendart.fss.or.kr/api";
// 동시 처리할 종목 수.
// 종목당: 연도별로 [주요계정 + alotMatter + 발행주식수 + 전체계정(현금) + 자사주] = 5개 API 호출.
// 연도는 순차 처리하므로 연도별 동시 DART 요청 상한 ≈ CONCURRENCY×5 = 20.
// 내부자(elestock)는 연도 루프 종료 후 종목당 1회 호출 → 연도별 5개 동시 fetch 피크엔 미가산이나
// wave 내 최대 CONCURRENCY(4)개 elestock가 동시 호출될 수 있음(DART 안전 범위).
// DB upsert 동시성은 CONCURRENCY(=4)로 유지(Postgres 안전 범위).
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

// 자기주식 취득·처분 현황 (tesstkAcqsDspsSttus)
interface TreasuryItem {
  stock_knd:      string;  // "보통주" | "우선주"
  acqs_mth1:      string;  // 취득방법 대분류 ("총계" 행 식별용)
  acqs_mth3:      string;  // 취득방법 소분류 ("소계"/"총계"/"합계")
  change_qy_acqs: string;  // 당기 취득수량
  change_qy_dsps: string;  // 당기 처분수량
  trmend_qy:      string;  // 기말 보유수량
}

// 임원·주요주주 소유보고 (elestock)
interface ElestockItem {
  rcept_dt:             string; // 접수일자 "YYYY-MM-DD"
  sp_stock_lmp_irds_cnt: string; // 특정증권등 소유 증감수량 (부호: +매수 / -매도)
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

// 주식 수량 파싱 (자사주·내부자). 콤마 제거, "-"/빈값→null,
// "△"/"▽" 또는 선행 "-"는 음수(매도/감소)로 처리.
function toQty(s: string | null | undefined): number | null {
  if (s == null) return null;
  let t = s.trim();
  if (t === "" || t === "-") return null;          // DART 빈값 표기
  let triangleNeg = false;
  if (/^[△▽]/.test(t)) { triangleNeg = true; t = t.slice(1); } // 일부 공시의 음수 표기
  t = t.replace(/,/g, "").trim();
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  // △/▽ 표기면 절댓값에 음수 적용(선행 "-"와 이중부호 충돌 방지).
  // 평범한 "-500"은 △ 없이 parseFloat 부호를 그대로 사용.
  return triangleNeg ? -Math.abs(n) : n;
}

// DART 접수일자 정규화 — "YYYYMMDD" / "YYYY-MM-DD" 양쪽을 "YYYY-MM-DD"로.
function normalizeDartDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
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

/**
 * tesstkAcqsDspsSttus: 자기주식 취득·처분 현황 (#7 자사주 매입 추이).
 * 보통주 "총계"(acqs_mth1==="총계") 행에서 당기 취득/처분/기말보유 수량(주)을 추출.
 * 총계 행이 없으면 보통주 개별 취득방법 행(소계/총계 제외) 합산으로 폴백.
 */
async function fetchTreasury(
  dartCode: string,
  year: number,
): Promise<{ acqs: number | null; dsps: number | null; held: number | null }> {
  const empty = { acqs: null, dsps: null, held: null };
  const url = `${DART_BASE}/tesstkAcqsDspsSttus.json?crtfc_key=${dartKey()}&corp_code=${dartCode}&bsns_year=${year}&reprt_code=11011`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return empty;
    const d: { status: string; list?: TreasuryItem[] } = await res.json();
    if (d.status !== "000" || !(d.list?.length)) return empty;

    const common = d.list.filter((r) => r.stock_knd === "보통주");
    if (common.length === 0) return empty;

    // 1순위: "총계" 행 (보통주 전체 합)
    const total = common.find((r) => r.acqs_mth1 === "총계" || r.acqs_mth3 === "총계");
    if (total) {
      return {
        acqs: toQty(total.change_qy_acqs),
        dsps: toQty(total.change_qy_dsps),
        held: toQty(total.trmend_qy),
      };
    }
    // 폴백: 소계/총계/합계 행을 제외한 개별 취득방법 행 합산 (mth1·mth3 양쪽 검사로 이중합산 방지)
    const rows = common.filter(
      (r) => !/소계|총계|합계/.test(r.acqs_mth3 ?? "") && !/소계|총계|합계/.test(r.acqs_mth1 ?? ""),
    );
    const sum = (sel: (r: TreasuryItem) => string): number | null => {
      const vals = rows.map((r) => toQty(sel(r))).filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    };
    return {
      acqs: sum((r) => r.change_qy_acqs),
      dsps: sum((r) => r.change_qy_dsps),
      held: sum((r) => r.trmend_qy),
    };
  } catch { return empty; }
}

// 같은 날(rcept_dt) 일괄 매수 보고를 '일괄부여(우리사주·스톡그랜트 등) 추정'으로 분리하는
// 임계값. 같은 날 매수(증가) 보고가 이 건수 이상이면, 그 날의 증가분 전체를 비자발적
// 일괄부여로 추정해 자발적 순매수에서 제외한다.
// 근거: 우리사주 배정·스톡그랜트는 동일일자에 다수 임직원에게 일괄 보고되어 같은 rcept_dt에
// 매수 보고가 수십~수백 건 몰린다(삼성전자 dry-run: 2026-02-02 매수보고 810건). 이는 경영진의
// 자발적 신뢰 매수(린치가 보는 호재 신호)가 아니라 보상·복지성 비자발 취득이므로, 자발적
// 순매수 판정에서 제외해 대형주 위양성 그린(PASS)을 방지한다. 임계 5는 자발적 개별 임원 매수가
// 같은 날 5건 이상 몰릴 가능성은 낮다는 보수적 디폴트(의심스러우면 제외 → 그린 강등).
const BULK_GRANT_MIN_REPORTS = 5;

/**
 * elestock: 임원·주요주주 소유보고 (#6 내부자 매수 vs 매도, 최근 6개월).
 * 연도 파라미터 없음 → 전체 이력 반환. rcept_dt가 최근 6개월 이내인 건만 필터해
 * sp_stock_lmp_irds_cnt(증감수량, 부호 유지)를 합산. 양수=매수, 음수=매도.
 *
 * 이중 집계:
 *  - netBuy(총 순매수): 6개월 내 모든 유효 증감 합(기존 동작 보존, 일괄부여 포함).
 *  - voluntaryNetBuy(자발적 순매수): 같은 날 매수 보고가 BULK_GRANT_MIN_REPORTS 이상인 날의
 *    증가분 전체를 일괄부여 추정으로 제외한 순매수. 린치 판정은 이 값을 기준으로 한다.
 *  - bulkGrantCount: 자발에서 제외된 일괄부여 추정 보고 건수(코멘트 근거용).
 */
async function fetchInsider6m(
  dartCode: string,
): Promise<{
  netBuy: number | null;
  voluntaryNetBuy: number | null;
  bulkGrantCount: number;
  buyCount: number;
  sellCount: number;
  asOf: Date | null;
} | null> {
  // 반환 규약:
  //  - 객체     : 정상 조회 완료(데이터 있음/없음 무관). 호출부에서 그대로 저장(NA 포함).
  //  - null     : 수집 실패(타임아웃/네트워크/HTTP/JSON 파싱/DART 에러 status).
  //               호출부에서 insider 컬럼 update를 건너뛰어 기존 값을 보존해야 함.
  // 정상 조회했으나 6개월 내 유효 보고가 0건 → NA 저장용 빈 결과.
  const empty = {
    netBuy: null, voluntaryNetBuy: null, bulkGrantCount: 0,
    buyCount: 0, sellCount: 0, asOf: null,
  };
  const url = `${DART_BASE}/elestock.json?crtfc_key=${dartKey()}&corp_code=${dartCode}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null; // HTTP 오류 = 수집 실패 → skip
    const d: { status: string; list?: ElestockItem[] } = await res.json();
    // DART status: "000"=정상, "013"=조회 데이터 없음(정상적 무데이터). 그 외=API 오류 → skip.
    if (d.status === "013") return empty;
    if (d.status !== "000") return null;
    if (!(d.list?.length)) return empty;

    // 6개월 전 컷오프 (rcept_dt "YYYY-MM-DD" 문자열 비교)
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 1) 6개월 윈도우 내 유효 건을 rcept_dt별로 그룹핑하며 총 합계 산출.
    let net = 0, buy = 0, sell = 0, any = false;
    const buyQtyByDate = new Map<string, number[]>(); // 날짜 → 매수(증가) 증감수량 목록
    for (const r of d.list) {
      if (!r.rcept_dt) continue;
      const date = normalizeDartDate(r.rcept_dt);
      if (date < cutoffStr) continue;
      const q = toQty(r.sp_stock_lmp_irds_cnt);
      if (q == null || q === 0) continue;
      any = true;
      net += q;
      if (q > 0) {
        buy++;
        (buyQtyByDate.get(date) ?? buyQtyByDate.set(date, []).get(date)!).push(q);
      } else {
        sell++;
      }
    }
    if (!any) return empty;

    // 2) 같은 날 매수 보고 ≥ BULK_GRANT_MIN_REPORTS → 그 날 증가분 전체를 일괄부여로 분류·제외.
    let bulkGrantQty = 0, bulkGrantCount = 0;
    for (const qs of buyQtyByDate.values()) {
      if (qs.length >= BULK_GRANT_MIN_REPORTS) {
        bulkGrantCount += qs.length;
        for (const q of qs) bulkGrantQty += q;
      }
    }
    const voluntaryNet = net - bulkGrantQty;

    return {
      netBuy: net,
      voluntaryNetBuy: voluntaryNet,
      bulkGrantCount,
      buyCount: buy,
      sellCount: sell,
      asOf: new Date(),
    };
  } catch {
    // AbortError(타임아웃)/네트워크/JSON 파싱 실패 = 수집 실패 → skip(기존 값 보존)
    return null;
  }
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
    const [items, alotItems, totalShares, cash, treasury] = await Promise.all([
      fetchYearlyFinancials(dartCode, year),
      fetchAlotMatter(dartCode, year),
      fetchShares(dartCode, year),
      fetchCash(dartCode, year), // 억원 단위
      fetchTreasury(dartCode, year), // 자사주 취득/처분/기말 (주)
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
      treasuryAcqs: treasury.acqs, treasuryDsps: treasury.dsps, treasuryHeld: treasury.held,
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

    // #6 내부자: 활성 종목(재무 수집 성공)에 한해 6개월 소유보고 집계 1회 호출.
    if (anyYear) {
      const ins = await fetchInsider6m(stock.dartCode).catch(() => null);
      // ins === null → 수집 실패(타임아웃 등). insider 컬럼 update를 건너뛰어 기존 값 보존.
      // 재무(stockFinancial)는 processYear에서 이미 즉시 upsert됨 → 영향 없음.
      if (ins) {
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            insiderNetBuy6m:          ins.netBuy,
            insiderVoluntaryNetBuy6m: ins.voluntaryNetBuy,
            insiderBulkGrantCount:    ins.bulkGrantCount,
            insiderBuyCount:          ins.buyCount,
            insiderSellCount:         ins.sellCount,
            insiderAsOf:              ins.asOf,
          },
        }).catch(() => {});
      }
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
