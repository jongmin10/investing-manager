// 52주 신고가 돌파 판정 로직 (docs/feature-52w-high-breakout.md §3 알고리즘 + §8.6 PO 결정).
//
// 핵심 결정(§8.6):
//  - D-1: cron이 적재한 주말/공휴일 더미 행을 제거해 시계열을 "거래일만"으로 정규화.
//  - D-3: "신규 신고가 경신"만 인정 → isBreakout 에 price(breakoutDate) > priorMaxPrice 조건 추가.
//  - D-4: quietMaxRatio 기본 80%(고점 대비 20%↑ 조정한 종목만 quiet 로 인정).
//  - AC-QUIET-BOUNDARY: quietOK 는 strict `<`, 단 위반 허용 ≤ floor(N*5%).
//  - AC-CONSOLIDATION-NOFLOOR: quiet 내 ratio≥quietMaxRatio 인 날이 없으면 consolidationDays = N.
//  - AC-PRIORMAX-UNIT: priorMaxRatio 는 0~100 %, 소수 1자리.

import { kstDateStr } from "@/lib/kst";
import type { BreakoutReason } from "@/lib/screener-types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 요일 (0=일 … 6=토) */
function kstDayOfWeek(d: Date): number {
  return new Date(d.getTime() + KST_OFFSET_MS).getUTCDay();
}

export interface BreakoutParams {
  /** N: 조정 구간 길이(거래일) */
  quietDays: number;
  /** M: 돌파 인정 최근 구간(거래일) */
  windowDays: number;
  /** 돌파 인정 허용오차(%) — 측정/반올림 오차 흡수용 */
  tolerance: number;
  /** 조정 구간 상단 비율(%) */
  quietMaxRatio: number;
}

export interface BreakoutSnapshotRow {
  date: Date;
  price: number;
  high52w: number;
  changeRate: number | null;
}

export interface BreakoutResult {
  breakout: boolean;
  breakoutDate: string | null;
  consolidationDays: number | null;
  priorMaxRatio: number | null;
  breakoutReason: BreakoutReason;
}

const NOT_BREAKOUT: BreakoutResult = {
  breakout: false,
  breakoutDate: null,
  consolidationDays: null,
  priorMaxRatio: null,
  breakoutReason: null,
};

/**
 * 혼재된 cadence(백필=거래일·KST자정, cron=주말 포함 매일·수집 instant)를
 * "거래일만"의 시계열로 정규화한다.
 *  1. 같은 KST 캘린더일은 1개로 (가장 최신 행 채택).
 *  2. KST 주말(토/일) 행 제거.
 *  3. 직전 거래일과 price 동일 && changeRate==0 인 더미 연속행(공휴일 등) 제거.
 *     (백필 행은 changeRate 가 null 이라 이 조건에 걸리지 않아 보존됨)
 * 입력은 date asc 정렬을 가정한다.
 */
export function normalizeTradingDays(rows: BreakoutSnapshotRow[]): BreakoutSnapshotRow[] {
  // 1. KST 일 버킷 — 나중 행이 덮어써 같은 날의 최신 행만 남음
  const byDay = new Map<string, BreakoutSnapshotRow>();
  for (const r of rows) byDay.set(kstDateStr(r.date), r);

  const days = [...byDay.keys()].sort().map((k) => byDay.get(k)!);

  const out: BreakoutSnapshotRow[] = [];
  for (const r of days) {
    const dow = kstDayOfWeek(r.date);
    if (dow === 0 || dow === 6) continue; // 2. 주말 제거
    const prev = out[out.length - 1];
    if (prev && r.changeRate === 0 && r.price === prev.price) continue; // 3. 더미 공휴일 행
    out.push(r);
  }
  return out;
}

/**
 * 단일 종목 시계열에 대한 52주 신고가 돌파 판정.
 * rows 는 date asc 정렬(정규화 전 원본)이어야 한다.
 */
export function evaluateBreakout(
  rows: BreakoutSnapshotRow[],
  p: BreakoutParams,
): BreakoutResult {
  const N = p.quietDays;
  const M = p.windowDays;
  const need = N + M;

  const series = normalizeTradingDays(rows);
  const available = series.length;

  // ── 데이터 충분성 게이트 ──────────────────────────────
  if (available < need) {
    // insufficient_history(신규상장·히스토리 짧음) vs low_density(결손 많음) 구분
    let reason: BreakoutReason = "insufficient_history";
    if (available >= 2) {
      const spanDays =
        (series[available - 1].date.getTime() - series[0].date.getTime()) / 86_400_000;
      const expectedForSpan = (spanDays * 5) / 7; // 캘린더 span 대비 기대 거래일
      // span 은 충분한데 실제 거래일이 80% 미만 → 결손율 높음(low_density)
      if (expectedForSpan >= need && available < expectedForSpan * 0.8) {
        reason = "low_density";
      }
    }
    return { ...NOT_BREAKOUT, breakoutReason: reason };
  }

  // ── 윈도 절단 ────────────────────────────────────────
  const window = series.slice(-need); // 마지막 (N+M) 거래일
  const quiet = window.slice(0, N); // 앞쪽 N
  const recent = window.slice(N); // 마지막 M (= slice(-M))

  const breakoutThreshold = 1 - p.tolerance / 100; // 예: 0.995
  const quietThreshold = p.quietMaxRatio / 100; // 예: 0.80

  const ratioOf = (r: BreakoutSnapshotRow): number | null =>
    r.high52w > 0 ? r.price / r.high52w : null;

  // ── 최근 돌파일 ──────────────────────────────────────
  let breakoutRow: BreakoutSnapshotRow | null = null;
  for (const r of recent) {
    const ratio = ratioOf(r);
    if (ratio != null && ratio >= breakoutThreshold) breakoutRow = r; // 최신 돌파일(max date) 채택
  }
  const breakoutRecently = breakoutRow != null;

  // ── quiet 구간 통계 ──────────────────────────────────
  // ratio 산출 불가(high52w<=0)는 위반으로 간주(Infinity)
  let priorMaxPrice = -Infinity;
  let priorMaxRatioRaw = 0;
  let violations = 0;
  let lastHighIdx = -1;
  for (let i = 0; i < quiet.length; i++) {
    const d = quiet[i];
    if (d.price > priorMaxPrice) priorMaxPrice = d.price;
    const ratio = ratioOf(d);
    const effRatio = ratio ?? Infinity;
    if (ratio != null && ratio > priorMaxRatioRaw) priorMaxRatioRaw = ratio;
    if (effRatio >= quietThreshold) {
      violations++;
      lastHighIdx = i;
    }
  }

  // AC-QUIET-BOUNDARY: strict `<`, 단일 이상치 허용 ≤ floor(N*5%)
  const allowance = Math.floor(N * 0.05);
  const quietOK = violations <= allowance;

  // AC-CONSOLIDATION-NOFLOOR: 마지막 ratio≥quietMaxRatio 이후 거래일 수, 없으면 N
  const consolidationDays = lastHighIdx === -1 ? N : quiet.length - 1 - lastHighIdx;

  // AC-PRIORMAX-UNIT: 0~100 %, 소수 1자리 (100% 상한)
  const priorMaxRatio = parseFloat((Math.min(priorMaxRatioRaw, 1) * 100).toFixed(1));

  // ── 최종 판정 (D-3: 신규 신고가 경신 = breakout price > priorMaxPrice) ──
  const isBreakout =
    breakoutRecently && quietOK && breakoutRow!.price > priorMaxPrice;

  return {
    breakout: isBreakout,
    breakoutDate: isBreakout ? kstDateStr(breakoutRow!.date) : null,
    consolidationDays,
    priorMaxRatio,
    breakoutReason: null,
  };
}
