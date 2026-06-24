import { prisma } from "./prisma";
import { LYNCH_POLICY } from "./lynch-policy";
import type {
  LynchResult,
  LynchMetric,
  LynchMetricKey,
  LynchFlag,
  SixCategory,
} from "./lynch-types";

// 정책 프롬프트는 src/lib/lynch-policy.ts 상수로 인라인(번들 보장). 런타임에
// docs/*.txt 를 읽지 않는다 — 이유는 lynch-policy.ts 상단 주석 참고.

// ─────────────────────────────────────────────────────────────────────────────
// GAP 지표 — 현 수집 파이프라인으로 확보 불가. 항상 "확인 불가"로 강제 덮어쓰기.
// Phase 2에서 DEBT_TO_EQUITY·CASH_TO_MCAP·EPS_CAGR_3Y는 DART BS/시계열로 해소됨.
// (데이터 결측 시에는 코드가 산출 단계에서 NA로 정직 처리하므로 강제 덮어쓰기 대상이 아님)
// 남은 하드 GAP은 내부자 거래·자사주 매입 (소스 자체 부재) — Phase 3 예정.
// ─────────────────────────────────────────────────────────────────────────────
const GAP_METRIC_KEYS = new Set<LynchMetricKey>([
  "INSIDER_TRADING",
  "BUYBACK_TREND",
]);

const UNAVAILABLE = "공시에서 확인 불가";

const METRIC_LABELS: Record<LynchMetricKey, string> = {
  PEG: "PEG (PER / 이익성장률)",
  DEBT_TO_EQUITY: "Debt-to-Equity",
  CASH_TO_MCAP: "현금 / 시총",
  EPS_CAGR_3Y: "EPS 성장률 (3년 CAGR)",
  OP_MARGIN_TREND: "영업이익률 추이",
  INSIDER_TRADING: "내부자 매수 vs 매도 (6M)",
  BUYBACK_TREND: "자사주 매입 추이",
};

const METRIC_CRITERIA: Record<LynchMetricKey, string> = {
  PEG: "< 1.0 이상적, > 2.0 위험",
  DEBT_TO_EQUITY: "< 0.5 양호",
  CASH_TO_MCAP: "클수록 안전마진",
  EPS_CAGR_3Y: "카테고리별 다름",
  OP_MARGIN_TREND: "개선 추세인가",
  INSIDER_TRADING: "매수가 의미 있음",
  BUYBACK_TREND: "꾸준한 매입이 호재",
};

const METRIC_ORDER: LynchMetricKey[] = [
  "PEG",
  "DEBT_TO_EQUITY",
  "CASH_TO_MCAP",
  "EPS_CAGR_3Y",
  "OP_MARGIN_TREND",
  "INSIDER_TRADING",
  "BUYBACK_TREND",
];

const SIX_CATEGORIES = new Set<SixCategory>([
  "SLOW_GROWER",
  "STALWART",
  "FAST_GROWER",
  "CYCLICAL",
  "ASSET_PLAY",
  "TURNAROUND",
]);

// 프론트 경고 표시용 라벨 (dataLimitations) — Phase 3까지 남은 하드 GAP만.
// D/E·현금/시총·EPS 3년 CAGR은 Phase 2에서 해소(데이터 있으면 산출, 없으면 개별 NA).
const GAP_LIMITATION_LABELS = [
  "내부자 매수·매도 (소스 없음)",
  "자사주 매입 추이 (소스 없음)",
];

// ─────────────────────────────────────────────────────────────────────────────
// 정형 수치 계산 결과 (코드가 DB에서 산출 — LLM에 '사실'로 주입)
// ─────────────────────────────────────────────────────────────────────────────
interface ComputedMetrics {
  peg: LynchMetric;
  debtToEquity: LynchMetric;
  cashToMcap: LynchMetric;
  epsCagr3y: LynchMetric;
  opMarginTrend: LynchMetric;
}

interface StockContext {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  snapshotDate: Date | null;
  financialPeriod: string | null;
  // 주입용 사실 텍스트 (LLM user 메시지에 삽입)
  facts: string;
  computed: ComputedMetrics;
}

function fmtNum(v: number | null | undefined, digits = 1): string | null {
  return v != null && Number.isFinite(v) ? Number(v.toFixed(digits)).toString() : null;
}

// PEG = PER / 이익성장률. 분모 0/음수 → NA.
function computePeg(per: number | null, growthPct: number | null): LynchMetric {
  let value: string | null = null;
  let numericValue: number | null = null;
  let result: LynchMetric["result"] = "NA";
  let comment: string;

  if (per != null && per > 0 && Number.isFinite(per) && growthPct != null && growthPct > 0 && Number.isFinite(growthPct)) {
    const peg = per / growthPct;
    numericValue = parseFloat(peg.toFixed(2));
    value = `${numericValue}x`;
    if (peg < 1.0) {
      result = "PASS";
      comment = `PER ${per.toFixed(1)} / 이익성장 ${growthPct.toFixed(1)}% = PEG ${numericValue} — 1.0 미만, 린치 기준 이상적.`;
    } else if (peg > 2.0) {
      result = "FAIL";
      comment = `PEG ${numericValue} — 2.0 초과, 린치 기준 위험 구간(성장 대비 고평가).`;
    } else {
      result = "FAIL";
      comment = `PEG ${numericValue} — 1.0~2.0 구간, 이상적(<1.0) 아님.`;
    }
  } else if (per != null && per > 0 && growthPct != null && growthPct <= 0) {
    comment = `이익성장률 ${growthPct?.toFixed(1)}%(0 이하)로 PEG 산출 불가 — 역성장 구간(추정).`;
  } else {
    comment = "PER 또는 이익성장률 결측으로 PEG 산출 불가.";
  }

  return {
    key: "PEG",
    label: METRIC_LABELS.PEG,
    value,
    numericValue,
    lynchCriterion: METRIC_CRITERIA.PEG,
    result,
    comment,
    source: value != null ? "NAVER PER + DART 순이익성장률" : UNAVAILABLE,
  };
}

// 금융·보험·증권업 판별 — D/E 기준(0.5)이 부적합한 섹터.
// 은행·보험은 예수금·보험부채가 '영업상' 부채라 D/E 10~20x도 정상.
const FINANCIAL_SECTOR_KEYWORDS = ["금융", "은행", "보험", "증권"];
function isFinancialSector(sector: string | null): boolean {
  if (!sector) return false;
  return FINANCIAL_SECTOR_KEYWORDS.some((kw) => sector.includes(kw));
}

// #2 Debt-to-Equity = 부채총계 / 자본총계 (둘 다 억원). 분모 0/음수 → NA.
// 금융/보험 계열은 부채 성격이 달라 0.5 기준이 부적합 → 값은 산출하되 result는 NA(참고용).
function computeDebtToEquity(totalDebt: number | null, totalEquity: number | null, period: string | null, sector: string | null): LynchMetric {
  let value: string | null = null;
  let numericValue: number | null = null;
  let result: LynchMetric["result"] = "NA";
  let comment: string;

  if (
    totalDebt != null && Number.isFinite(totalDebt) && totalDebt >= 0 &&
    totalEquity != null && Number.isFinite(totalEquity) && totalEquity > 0
  ) {
    const de = totalDebt / totalEquity;
    numericValue = parseFloat(de.toFixed(2));
    value = `${numericValue}x`;
    if (isFinancialSector(sector)) {
      // 금융업: PASS/FAIL 판정 보류, 수치는 참고로만 노출
      result = "NA";
      comment = `부채총계/자본총계 = ${numericValue} — 금융업은 부채 성격이 달라(예수금·보험부채) 일반 D/E 기준 적용 부적합 — 참고만.`;
    } else if (de < 0.5) {
      result = "PASS";
      comment = `부채총계/자본총계 = ${numericValue} — 0.5 미만, 린치 기준 재무 양호.`;
    } else {
      result = "FAIL";
      comment = `부채총계/자본총계 = ${numericValue} — 0.5 이상, 부채 부담 유의.`;
    }
  } else if (totalEquity != null && totalEquity <= 0) {
    comment = `자본총계 ${totalEquity}억원(0 이하) — 자본잠식 가능성, D/E 산출 불가.`;
  } else {
    comment = "부채총계 또는 자본총계 결측으로 D/E 산출 불가.";
  }

  return {
    key: "DEBT_TO_EQUITY",
    label: METRIC_LABELS.DEBT_TO_EQUITY,
    value,
    numericValue,
    lynchCriterion: METRIC_CRITERIA.DEBT_TO_EQUITY,
    result,
    comment,
    source: value != null ? `${period ?? "최근"} DART (재무상태표)` : UNAVAILABLE,
  };
}

// #3 현금/시총 = 현금및현금성자산 / 시가총액 (둘 다 억원). 분모 0/음수 → NA.
function computeCashToMcap(cash: number | null, marketCap: number | null, period: string | null): LynchMetric {
  let value: string | null = null;
  let numericValue: number | null = null;
  let result: LynchMetric["result"] = "NA";
  let comment: string;

  if (
    cash != null && Number.isFinite(cash) && cash >= 0 &&
    marketCap != null && Number.isFinite(marketCap) && marketCap > 0
  ) {
    const ratio = cash / marketCap;
    numericValue = parseFloat((ratio * 100).toFixed(1)); // % 표기
    value = `${numericValue}%`;
    // 린치: 현금 비중이 클수록 안전마진. 20% 이상이면 의미 있는 쿠션으로 본다.
    if (ratio >= 0.2) {
      result = "PASS";
      comment = `현금및현금성자산 ${cash.toLocaleString()}억 / 시총 = ${numericValue}% — 현금 쿠션 두터움(안전마진).`;
    } else {
      result = "FAIL";
      comment = `현금및현금성자산 ${cash.toLocaleString()}억 / 시총 = ${numericValue}% — 현금 비중 제한적.`;
    }
  } else {
    comment = "현금성자산 또는 시가총액 결측으로 현금/시총 산출 불가.";
  }

  return {
    key: "CASH_TO_MCAP",
    label: METRIC_LABELS.CASH_TO_MCAP,
    value,
    numericValue,
    lynchCriterion: METRIC_CRITERIA.CASH_TO_MCAP,
    result,
    comment,
    source: value != null ? `${period ?? "최근"} DART 현금 + 시가총액` : UNAVAILABLE,
  };
}

// #4 EPS 3년 CAGR — 가장 오래된 연도 EPS → 최신 EPS 복리성장률.
// 부호 전환(적자→흑자 등)이나 EPS≤0 구간은 CAGR 정의 불가 → NA + 사유.
// 기준연도 EPS가 너무 작으면(적자탈출 직후 등) 분모가 1원에 가까워 수천% CAGR이 나옴 →
// EPS_BASE_MIN 가드로 차단 (revenue의 GROWTH_BASE_MIN 패턴과 동일 취지).
// series: 최신순 정렬된 {period, eps} 배열 (analyzer가 desc로 전달).
const EPS_BASE_MIN = 10; // 기준연도 EPS 절댓값 < 10원이면 CAGR 신뢰 불가 → NA
function computeEpsCagr3y(series: { period: string; eps: number | null }[]): LynchMetric {
  let value: string | null = null;
  let numericValue: number | null = null;
  let result: LynchMetric["result"] = "NA";
  let comment: string;
  // 라벨은 실제 구간 수를 반영해 동적 생성 (2개년만 있으면 "1년 CAGR")
  let label = METRIC_LABELS.EPS_CAGR_3Y;

  const valid = series.filter((s) => s.eps != null && Number.isFinite(s.eps)) as { period: string; eps: number }[];

  if (valid.length >= 2) {
    const latest = valid[0];          // 최신 (desc 정렬 가정)
    const oldest = valid[valid.length - 1];
    const years = valid.length - 1;   // 구간 수 (3개년이면 2)
    label = `EPS 성장률 (${years}년 CAGR)`;
    if (latest.eps > 0 && oldest.eps >= EPS_BASE_MIN) {
      const cagr = (Math.pow(latest.eps / oldest.eps, 1 / years) - 1) * 100;
      if (Number.isFinite(cagr)) {
        numericValue = parseFloat(cagr.toFixed(1));
        value = `${numericValue}%`;
        // 린치: 카테고리별 다르나, 일반적으로 꾸준한 두 자릿수 성장을 긍정.
        if (cagr >= 15) {
          result = "PASS";
          comment = `EPS ${oldest.period}→${latest.period} ${years}년 CAGR ${numericValue}% — 두 자릿수 성장, 양호.`;
        } else if (cagr >= 0) {
          result = "FAIL";
          comment = `EPS ${years}년 CAGR ${numericValue}% — 성장은 하나 둔(15% 미만).`;
        } else {
          result = "FAIL";
          comment = `EPS ${years}년 CAGR ${numericValue}% — 역성장.`;
        }
      } else {
        comment = "EPS CAGR 계산 결과가 유효하지 않음.";
      }
    } else if (latest.eps > 0 && oldest.eps > 0 && oldest.eps < EPS_BASE_MIN) {
      // 기준연도 EPS가 양수지만 너무 작음 → 분모 효과로 CAGR 과대, 신뢰 불가
      comment = `기준연도(${oldest.period}) EPS ${oldest.eps}원이 너무 작아 CAGR 신뢰 불가(적자탈출 직후 추정).`;
    } else {
      comment = `EPS에 0 이하 값 포함(${oldest.period} ${oldest.eps} / ${latest.period} ${latest.eps}) — 부호 전환 구간으로 CAGR 정의 불가.`;
    }
  } else {
    comment = "EPS 다년 시계열 부족(2개년 미만)으로 3년 CAGR 산출 불가.";
  }

  return {
    key: "EPS_CAGR_3Y",
    label,
    value,
    numericValue,
    lynchCriterion: METRIC_CRITERIA.EPS_CAGR_3Y,
    result,
    comment,
    source: value != null ? "DART alotMatter (다년 EPS)" : UNAVAILABLE,
  };
}

// #5 영업이익률 추이 — 다년 opMargin 시계열로 방향 판정. 시계열 없으면 단년+opGrowth로 근사.
// series: 최신순 정렬된 {period, opMargin} 배열.
function computeOpMarginTrendMulti(
  series: { period: string; opMargin: number | null }[],
  opGrowth: number | null,
): LynchMetric {
  const valid = series.filter((s) => s.opMargin != null && Number.isFinite(s.opMargin)) as { period: string; opMargin: number }[];

  // 다년(2개년 이상) 시계열이 있으면 최신 vs 가장 오래된 마진 비교로 추이 판정
  if (valid.length >= 2) {
    const latest = valid[0];
    const oldest = valid[valid.length - 1];
    const numericValue = parseFloat(latest.opMargin.toFixed(1));
    const delta = latest.opMargin - oldest.opMargin;
    const value = `${numericValue}%`;
    let result: LynchMetric["result"];
    let comment: string;
    if (delta > 0.5) {
      result = "PASS";
      comment = `영업이익률 ${oldest.period} ${oldest.opMargin.toFixed(1)}% → ${latest.period} ${numericValue}% (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%p) — 개선 추세.`;
    } else if (delta < -0.5) {
      result = "FAIL";
      comment = `영업이익률 ${oldest.period} ${oldest.opMargin.toFixed(1)}% → ${latest.period} ${numericValue}% (${delta.toFixed(1)}%p) — 둔화 추세.`;
    } else {
      result = "FAIL";
      comment = `영업이익률 ${oldest.period} ${oldest.opMargin.toFixed(1)}% → ${latest.period} ${numericValue}% — 보합(뚜렷한 개선 아님).`;
    }
    return {
      key: "OP_MARGIN_TREND",
      label: METRIC_LABELS.OP_MARGIN_TREND,
      value,
      numericValue,
      lynchCriterion: METRIC_CRITERIA.OP_MARGIN_TREND,
      result,
      comment,
      source: `${oldest.period}~${latest.period} DART (다년)`,
    };
  }

  // 폴백: 단년 + opGrowth 방향 근사 (Phase 1 동작 유지)
  const latest = valid[0];
  return computeOpMarginTrend(latest?.opMargin ?? null, opGrowth, latest?.period ?? null);
}

// 영업이익률 추이 — 당년 opMargin + opGrowth 방향으로 근사 (다년 시계열 부재).
function computeOpMarginTrend(opMargin: number | null, opGrowth: number | null, period: string | null): LynchMetric {
  let value: string | null = null;
  let numericValue: number | null = null;
  let result: LynchMetric["result"] = "NA";
  let comment: string;

  if (opMargin != null && Number.isFinite(opMargin)) {
    numericValue = parseFloat(opMargin.toFixed(1));
    value = `${numericValue}%`;
    if (opGrowth != null) {
      if (opGrowth > 0) {
        result = "PASS";
        comment = `당년 영업이익률 ${numericValue}%, 영업이익 YoY +${opGrowth.toFixed(1)}% — 개선 방향(단년 근사, 추이는 다년 필요).`;
      } else {
        result = "FAIL";
        comment = `당년 영업이익률 ${numericValue}%, 영업이익 YoY ${opGrowth.toFixed(1)}% — 둔화 방향(단년 근사).`;
      }
    } else {
      comment = `당년 영업이익률 ${numericValue}% — 성장률 결측으로 추이 판정 불가(단년값만 제공).`;
    }
  } else {
    comment = "영업이익률 결측.";
  }

  return {
    key: "OP_MARGIN_TREND",
    label: METRIC_LABELS.OP_MARGIN_TREND,
    value,
    numericValue,
    lynchCriterion: METRIC_CRITERIA.OP_MARGIN_TREND,
    result,
    comment,
    source: value != null ? `${period ?? "최근"} DART (단년)` : UNAVAILABLE,
  };
}

// GAP 지표 — 항상 "확인 불가" 메트릭 생성
function gapMetric(key: LynchMetricKey, reason: string): LynchMetric {
  return {
    key,
    label: METRIC_LABELS[key],
    value: null,
    numericValue: null,
    lynchCriterion: METRIC_CRITERIA[key],
    result: "NA",
    comment: reason,
    source: UNAVAILABLE,
  };
}

const GAP_REASONS: Record<string, string> = {
  INSIDER_TRADING: "내부자 거래 소스 없음 — 확인 불가(Phase 3 예정).",
  BUYBACK_TREND: "자사주 매입 소스 없음 — 확인 불가(Phase 3 예정).",
};

// ─────────────────────────────────────────────────────────────────────────────
// DB 조회 + 정형 수치 계산
// ─────────────────────────────────────────────────────────────────────────────
async function buildStockContext(ticker: string): Promise<
  | { ok: true; ctx: StockContext }
  | { ok: false; code: 404 | 409; message: string }
> {
  const stock = await prisma.stock.findUnique({ where: { id: ticker } });
  if (!stock) return { ok: false, code: 404, message: "지원하지 않는 종목코드입니다." };

  const snapshot = await prisma.stockSnapshot.findFirst({
    where: { stockId: ticker },
    orderBy: { date: "desc" },
  });
  if (!snapshot) return { ok: false, code: 409, message: "아직 데이터 수집 전입니다." };

  // 연간 시계열 (최신순) — EPS CAGR·마진 추이 산출용.
  const annualSeries = await prisma.stockFinancial.findMany({
    where: { stockId: ticker, period: { endsWith: "A" } },
    orderBy: { period: "desc" },
  });
  // 연간이 하나도 없으면 가장 최근 기간(분기 포함) 단건으로 폴백
  const fin =
    annualSeries[0] ??
    (await prisma.stockFinancial.findFirst({
      where: { stockId: ticker },
      orderBy: { period: "desc" },
    }));

  // PEG: PER 우선순위 = 실적 per → 컨센서스 cnsPer. 분모 = 순이익 성장률.
  const per = snapshot.per ?? snapshot.cnsPer ?? null;
  const growth = fin?.netGrowth ?? null;
  const peg = computePeg(per, growth);

  // #2 D/E, #3 현금/시총 — 최신 연간 재무의 BS 항목 사용.
  // D/E는 섹터(금융/보험)에 따라 기준 적용 여부가 달라 stock.sector 전달.
  const debtToEquity = computeDebtToEquity(fin?.totalDebt ?? null, fin?.totalEquity ?? null, fin?.period ?? null, stock.sector ?? null);
  const cashToMcap = computeCashToMcap(fin?.cash ?? null, snapshot.marketCap ?? null, fin?.period ?? null);

  // #4 EPS 3년 CAGR — 연간 시계열 EPS (최신순)
  const epsCagr3y = computeEpsCagr3y(annualSeries.map((f) => ({ period: f.period, eps: f.eps })));

  // #5 영업이익률 추이 — 연간 시계열 opMargin (최신순), 없으면 단년+opGrowth 폴백
  const opMarginTrend = computeOpMarginTrendMulti(
    annualSeries.map((f) => ({ period: f.period, opMargin: f.opMargin })),
    fin?.opGrowth ?? null,
  );

  const market = (stock.market === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as "KOSPI" | "KOSDAQ";

  // LLM 주입용 사실 — 코드가 산출한 수치만 '사실'로 전달
  const facts = [
    `종목코드: ${stock.id}`,
    `종목명: ${stock.name}`,
    `시장: ${market}`,
    `섹터: ${stock.sector ?? "(미분류)"}`,
    `시가총액: ${snapshot.marketCap != null ? `${snapshot.marketCap.toLocaleString()}억원` : "확인 불가"}`,
    `현재가: ${snapshot.price.toLocaleString()}원`,
    `52주 최고/최저: ${snapshot.high52w.toLocaleString()} / ${snapshot.low52w.toLocaleString()}원`,
    `PER: ${fmtNum(snapshot.per, 2) ?? "확인 불가"}  컨센서스PER: ${fmtNum(snapshot.cnsPer, 2) ?? "확인 불가"}`,
    `PBR: ${fmtNum(snapshot.pbr, 2) ?? "확인 불가"}`,
    `배당수익률: ${fmtNum(snapshot.dividendYield, 2) ?? "확인 불가"}%`,
    fin ? `재무기준: ${fin.period}` : "재무: 확인 불가",
    `매출: ${fin?.revenue != null ? `${fin.revenue.toLocaleString()}억원` : "확인 불가"}  매출성장 YoY: ${fmtNum(fin?.revenueGrowth) ?? "확인 불가"}%`,
    `영업이익: ${fin?.operatingProfit != null ? `${fin.operatingProfit.toLocaleString()}억원` : "확인 불가"}  영업이익성장 YoY: ${fmtNum(fin?.opGrowth) ?? "확인 불가"}%`,
    `순이익: ${fin?.netIncome != null ? `${fin.netIncome.toLocaleString()}억원` : "확인 불가"}  순이익성장 YoY: ${fmtNum(fin?.netGrowth) ?? "확인 불가"}%`,
    `영업이익률: ${fmtNum(fin?.opMargin) ?? "확인 불가"}%`,
    `EPS: ${fin?.eps != null ? `${fin.eps.toLocaleString()}원` : "확인 불가"}  BPS: ${fin?.bps != null ? `${fin.bps.toLocaleString()}원` : "확인 불가"}`,
    `부채총계: ${fin?.totalDebt != null ? `${fin.totalDebt.toLocaleString()}억원` : "확인 불가"}  자본총계: ${fin?.totalEquity != null ? `${fin.totalEquity.toLocaleString()}억원` : "확인 불가"}  현금성자산: ${fin?.cash != null ? `${fin.cash.toLocaleString()}억원` : "확인 불가"}`,
    `연간 재무 수집연도: ${annualSeries.length > 0 ? annualSeries.map((f) => f.period).join(", ") : "없음"}`,
    "",
    "[코드가 계산한 핵심 지표 — 이 값을 그대로 '사실'로 사용하라]",
    `PEG = ${peg.value ?? "확인 불가"} (${peg.comment})`,
    `Debt-to-Equity = ${debtToEquity.value ?? "확인 불가"} (${debtToEquity.comment})`,
    `현금/시총 = ${cashToMcap.value ?? "확인 불가"} (${cashToMcap.comment})`,
    `EPS 3년 CAGR = ${epsCagr3y.value ?? "확인 불가"} (${epsCagr3y.comment})`,
    `영업이익률 추이 = ${opMarginTrend.value ?? "확인 불가"} (${opMarginTrend.comment})`,
    "",
    "[확인 불가 지표 — 반드시 '공시에서 확인 불가'로 처리하고 숫자를 지어내지 마라]",
    `- 항상 확인 불가: 내부자 매수·매도, 자사주 매입 추이`,
    ...(() => {
      // 데이터 결측으로 산출 불가한 지표만 추가 경고 (값이 있으면 LLM이 그대로 사용)
      const naComputed = [
        debtToEquity.value == null ? "Debt-to-Equity" : null,
        cashToMcap.value == null ? "현금/시총" : null,
        epsCagr3y.value == null ? "EPS 3년 CAGR" : null,
      ].filter((s): s is string => s != null);
      return naComputed.length > 0 ? [`- 이번 종목은 데이터 결측으로 확인 불가: ${naComputed.join(", ")}`] : [];
    })(),
  ].join("\n");

  return {
    ok: true,
    ctx: {
      ticker: stock.id,
      name: stock.name,
      market,
      sector: stock.sector,
      snapshotDate: snapshot.date,
      financialPeriod: fin?.period ?? null,
      facts,
      computed: { peg, debtToEquity, cashToMcap, epsCagr3y, opMarginTrend },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM 호출 (report-generator.ts 패턴 재사용 — 키 없으면 graceful)
// ─────────────────────────────────────────────────────────────────────────────
const LLM_MODEL = "google/gemini-2.5-flash";

interface LlmRaw {
  categories?: { type?: string; weightPct?: number | null; rationale?: string }[];
  twoMinuteDrill?: {
    whatItSells?: string;
    whosBuying?: string;
    howItMakesMoney?: string;
    biggestRisk?: string;
  };
  checklistComments?: Partial<Record<LynchMetricKey, string>>; // GAP 외 지표 코멘트 보강(선택)
  greenFlags?: { label?: string; result?: string; comment?: string }[];
  redFlags?: { label?: string; result?: string; comment?: string }[];
  verdict?: { action?: string; rationale?: string };
  validation?: { weakestAssumption?: string; sources?: string[] };
}

function buildUserPrompt(ctx: StockContext): string {
  return `다음은 분석 대상 한국 종목의 '코드가 DB에서 확정한 사실'이다. 아래 사실만 숫자 근거로 사용하고, 없는 숫자는 절대 지어내지 마라.

${ctx.facts}

위 사실을 바탕으로 피터 린치 6단계 프레임워크 분석을 수행하고, 반드시 아래 JSON 스키마로만 응답하라. 마크다운/설명 없이 JSON 객체 하나만 출력하라.

{
  "categories": [{"type": "SLOW_GROWER|STALWART|FAST_GROWER|CYCLICAL|ASSET_PLAY|TURNAROUND", "weightPct": 70, "rationale": "매출성장·마진·산업사이클 근거 (한 문장)"}],
  "twoMinuteDrill": {
    "whatItSells": "이 회사는 무엇을 파는가 (50자 이내)",
    "whosBuying": "누가 사주는가 + 경쟁구조 (50자 이내)",
    "howItMakesMoney": "어떻게 돈을 버는가 (50자 이내)",
    "biggestRisk": "무엇이 망가지면 무너지는가 (50자 이내)"
  },
  "checklistComments": { "PEG": "한 줄 코멘트", "DEBT_TO_EQUITY": "한 줄 코멘트", "CASH_TO_MCAP": "한 줄 코멘트", "EPS_CAGR_3Y": "한 줄 코멘트", "OP_MARGIN_TREND": "한 줄 코멘트" },
  "greenFlags": [
    {"label": "이름/발음이 지루한가", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "사업이 따분·혐오스러운가", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "분사(spin-off) 기업인가", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "기관 보유율이 낮은가(5% 미만)", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "내부자가 자기 돈으로 사는가", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "자사주 매입 중인가", "result": "PASS|FAIL|NA", "comment": "한 줄"}
  ],
  "redFlags": [
    {"label": "'다음 OO'로 불리는가", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "diworsification 흔적", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "한 고객이 매출 25% 이상", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "핫한 산업의 핫한 종목인가", "result": "PASS|FAIL|NA", "comment": "한 줄"},
    {"label": "경영진이 거시 핑계를 대는가", "result": "PASS|FAIL|NA", "comment": "한 줄"}
  ],
  "verdict": {"action": "BUY|HOLD|SELL", "rationale": "1~4단계 종합 사고흐름 (한 단락)"},
  "validation": {"weakestAssumption": "이 분석의 가장 약한 가정 (한 줄)", "sources": ["검증할 1차자료1", "검증할 1차자료2"]}
}

주의:
- 내부자/자사주/기관보유율 관련 항목은 데이터 소스가 없으므로 result는 "NA", comment는 "공시에서 확인 불가" 취지로 적어라. 숫자를 추정하지 마라.
- 부채비율(D/E)·현금/시총·EPS 3년 CAGR·영업이익률 추이는 위 '코드가 계산한 핵심 지표'에 값이 있으면 그 값을 사실로 받아들이고, "확인 불가"로 표시된 경우에만 NA로 처리하라. checklistComments에는 해당 지표에 대한 해석 코멘트만 한 줄로 적어라(숫자 재계산 금지).
- greenFlags는 정확히 6개, redFlags는 정확히 5개, categories는 1~2개.
- 모든 텍스트는 한국어. 재무용어 영어 병기 허용.`;
}

async function callLlm(ctx: StockContext): Promise<LlmRaw | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null; // 키 없으면 graceful

  const body = JSON.stringify({
    model: LLM_MODEL,
    messages: [
      {
        role: "system",
        content:
          LYNCH_POLICY +
          "\n\n[출력 규칙] 반드시 사용자가 지정한 JSON 스키마로만 응답한다. 면책 문구 금지. 데이터 없으면 '공시에서 확인 불가'. 추정치는 '추정' 명시.",
      },
      { role: "user", content: buildUserPrompt(ctx) },
    ],
    temperature: 0.3,
    max_tokens: 2500,
  });

  // JSON 추출 실패 시 1회 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const text: string = json.choices?.[0]?.message?.content ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      return JSON.parse(match[0]) as LlmRaw;
    } catch {
      // 타임아웃/파싱 오류 → 재시도
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM 응답 + 코드 산출 수치 병합 → LynchResult (GAP 강제 덮어쓰기 후처리)
// ─────────────────────────────────────────────────────────────────────────────
function coerceCategory(t: string | undefined): SixCategory | null {
  if (!t) return null;
  const up = t.toUpperCase().trim() as SixCategory;
  return SIX_CATEGORIES.has(up) ? up : null;
}

function coerceFlagResult(r: string | undefined): LynchFlag["result"] {
  const up = (r ?? "").toUpperCase().trim();
  if (up === "PASS" || up === "FAIL" || up === "NA") return up;
  return "NA";
}

function nonEmpty(s: string | undefined, fallback: string): string {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : fallback;
}

function buildResult(ctx: StockContext, raw: LlmRaw): LynchResult {
  // ① categories — 1~2개, 유효한 것만, 없으면 안전 폴백
  const categories = (raw.categories ?? [])
    .map((c) => {
      const type = coerceCategory(c.type);
      if (!type) return null;
      return {
        type,
        weightPct: typeof c.weightPct === "number" ? c.weightPct : null,
        rationale: nonEmpty(c.rationale, "(분류 근거 확인 불가)"),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c != null)
    .slice(0, 2);
  if (categories.length === 0) {
    categories.push({ type: "STALWART", weightPct: null, rationale: "(LLM 분류 실패 — 기본 분류, 확인 필요)" });
  }

  // ② checklist — 코드 산출 지표(PEG·D/E·현금/시총·EPS CAGR·영업이익률) + 하드 GAP 강제.
  // 코드 산출 지표는 데이터 결측 시 산출 함수가 result:"NA"·value:null로 정직 처리하므로
  // 별도 강제 덮어쓰기가 불필요(LLM은 checklist 값을 만들지 않고 코멘트만 보강).
  const computedByKey: Partial<Record<LynchMetricKey, LynchMetric>> = {
    PEG: ctx.computed.peg,
    DEBT_TO_EQUITY: ctx.computed.debtToEquity,
    CASH_TO_MCAP: ctx.computed.cashToMcap,
    EPS_CAGR_3Y: ctx.computed.epsCagr3y,
    OP_MARGIN_TREND: ctx.computed.opMarginTrend,
  };
  const checklist: LynchMetric[] = METRIC_ORDER.map((key) => {
    const computed = computedByKey[key];
    if (computed) {
      const m = { ...computed };
      const llmComment = raw.checklistComments?.[key]?.trim();
      if (llmComment && m.value != null) m.comment = `${m.comment} ${llmComment}`;
      return m;
    }
    // 하드 GAP 지표(내부자/자사주) — LLM이 뭘 넣었든 무시하고 강제 "확인 불가"
    return gapMetric(key, GAP_REASONS[key] ?? UNAVAILABLE);
  });

  // ③ two-minute drill — 빈 필드 금지 (최소 "(확인 불가)")
  const twoMinuteDrill = {
    whatItSells: nonEmpty(raw.twoMinuteDrill?.whatItSells, "(확인 불가)"),
    whosBuying: nonEmpty(raw.twoMinuteDrill?.whosBuying, "(확인 불가)"),
    howItMakesMoney: nonEmpty(raw.twoMinuteDrill?.howItMakesMoney, "(확인 불가)"),
    biggestRisk: nonEmpty(raw.twoMinuteDrill?.biggestRisk, "(확인 불가)"),
  };

  // ④ flags — 고정 개수 보정. GAP에 해당하는 플래그(내부자/자사주/기관보유율)는 NA 강제.
  const greenFlags = normalizeFlags(raw.greenFlags, 6, [
    "이름/발음이 지루한가",
    "사업이 따분·혐오스러운가",
    "분사(spin-off) 기업인가",
    "기관 보유율이 낮은가(5% 미만)",
    "내부자가 자기 돈으로 사는가",
    "자사주 매입 중인가",
  ]);
  // 내부자(4번 idx)·자사주(5번 idx)·기관보유율(3번 idx)은 소스 없음 → NA 강제
  forceNa(greenFlags, [3, 4, 5], "관련 데이터 미수집 — 공시에서 확인 불가.");

  const redFlags = normalizeFlags(raw.redFlags, 5, [
    "'다음 OO'로 불리는가",
    "diworsification 흔적",
    "한 고객이 매출 25% 이상",
    "핫한 산업의 핫한 종목인가",
    "경영진이 거시 핑계를 대는가",
  ]);

  // ⑤ verdict
  const action = (() => {
    const a = (raw.verdict?.action ?? "").toUpperCase().trim();
    return a === "BUY" || a === "HOLD" || a === "SELL" ? a : "HOLD";
  })();
  const verdict = {
    action: action as "BUY" | "HOLD" | "SELL",
    rationale: nonEmpty(raw.verdict?.rationale, "(결론 근거 확인 불가 — 데이터 부족)"),
  };

  // ⑥ validation
  const srcArr = Array.isArray(raw.validation?.sources) ? raw.validation!.sources! : [];
  const validation = {
    weakestAssumption: nonEmpty(
      raw.validation?.weakestAssumption,
      "GAP 지표(부채비율·현금·내부자·자사주) 미반영 — 안전성/수급 판단이 가장 약한 가정.",
    ),
    sources: [
      nonEmpty(srcArr[0], "최근 사업보고서/감사보고서 (DART)"),
      nonEmpty(srcArr[1], "최근 분기보고서 및 IR 자료"),
    ] as [string, string],
  };

  return { categories, checklist, twoMinuteDrill, greenFlags, redFlags, verdict, validation };
}

function normalizeFlags(
  raw: { label?: string; result?: string; comment?: string }[] | undefined,
  count: number,
  defaultLabels: string[],
): LynchFlag[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: LynchFlag[] = [];
  for (let i = 0; i < count; i++) {
    const r = arr[i];
    out.push({
      label: nonEmpty(r?.label, defaultLabels[i] ?? `항목 ${i + 1}`),
      result: coerceFlagResult(r?.result),
      comment: nonEmpty(r?.comment, "(확인 불가)"),
    });
  }
  return out;
}

function forceNa(flags: LynchFlag[], indices: number[], comment: string): void {
  for (const i of indices) {
    if (flags[i]) {
      flags[i].result = "NA";
      flags[i].comment = comment;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 진입점: 분석 실행 + DB 영속화 (status pending→done/failed)
// 라우트가 이미 pending row 를 만든 뒤 호출. analysisId 로 갱신.
// ─────────────────────────────────────────────────────────────────────────────
export async function runLynchAnalysis(analysisId: string, ticker: string): Promise<void> {
  const built = await buildStockContext(ticker);
  if (!built.ok) {
    // 데이터 결격 — failed 로 기록 (라우트에서 사전 검증하지만 방어적으로 처리)
    await prisma.lynchAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", error: built.message },
    });
    return;
  }

  const { ctx } = built;
  try {
    const raw = await callLlm(ctx);
    if (!raw) {
      await prisma.lynchAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          error: process.env.OPENROUTER_API_KEY
            ? "LLM 응답 파싱 실패 (타임아웃/형식 오류)"
            : "OPENROUTER_API_KEY 미설정",
          snapshotDate: ctx.snapshotDate,
          financialPeriod: ctx.financialPeriod,
          model: LLM_MODEL,
        },
      });
      return;
    }

    const result = buildResult(ctx, raw);

    await prisma.lynchAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "done",
        result: JSON.stringify(result),
        snapshotDate: ctx.snapshotDate,
        financialPeriod: ctx.financialPeriod,
        model: LLM_MODEL,
        error: null,
        generatedAt: new Date(),
      },
    });
  } catch (e) {
    await prisma.lynchAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        error: e instanceof Error ? e.message.slice(0, 300) : "분석 실패",
        snapshotDate: ctx.snapshotDate,
        financialPeriod: ctx.financialPeriod,
      },
    });
  }
}

// 라우트가 사용할 사전 검증 + 최신 snapshotDate 조회 (캐시 키 산출용)
export async function resolveStockMeta(ticker: string): Promise<
  | { ok: true; name: string; market: "KOSPI" | "KOSDAQ"; sector: string | null; snapshotDate: Date }
  | { ok: false; code: 404 | 409; message: string }
> {
  const stock = await prisma.stock.findUnique({ where: { id: ticker } });
  if (!stock) return { ok: false, code: 404, message: "지원하지 않는 종목코드입니다." };

  const snapshot = await prisma.stockSnapshot.findFirst({
    where: { stockId: ticker },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!snapshot) return { ok: false, code: 409, message: "아직 데이터 수집 전입니다." };

  return {
    ok: true,
    name: stock.name,
    market: (stock.market === "KOSDAQ" ? "KOSDAQ" : "KOSPI") as "KOSPI" | "KOSDAQ",
    sector: stock.sector,
    snapshotDate: snapshot.date,
  };
}

export const LYNCH_DATA_LIMITATIONS = GAP_LIMITATION_LABELS;
export { GAP_METRIC_KEYS };
