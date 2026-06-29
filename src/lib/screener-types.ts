// 스크리너 API(`GET /api/screener`) 응답 계약 (contract-first).
// 백엔드(super)·프런트(wonder)가 동일 타입을 import 해 빌드 불일치를 방지한다.
// 이 파일은 "와이어(JSON) 계약" 기준이므로 날짜는 모두 string(ISO)로 표기한다.

/** 52주 신고가 돌파 판정 보류 사유 (null = 정상 판정됨) */
export type BreakoutReason = "insufficient_history" | "low_density" | null;

export interface ScreenerItem {
  id: string;
  name: string;
  market: string;
  sector: string | null;
  price: number;
  changeRate: number | null;
  high52w: number;
  low52w: number;
  high52wRatio: number;
  volume: number | null;
  collectedAt: string;
  revenue: number | null;
  operatingProfit: number | null;
  revenueGrowth: number | null;
  opGrowth: number | null;
  netGrowth: number | null;
  opMargin: number | null;
  // 가치지표
  cnsEps: number | null;
  per: number | null;
  cnsPer: number | null;
  pbr: number | null;
  dividendYield: number | null;
  period: string | null;
  // ── 52주 신고가 돌파 (breakout 필터 ON 일 때만 의미값; OFF면 기본값) ──
  /** 조정(횡보) 후 최근 신규 신고가 경신 충족 여부 */
  breakout: boolean;
  /** 최근 돌파일 (ISO, KST 자정 정규화). 미돌파/보류 시 null */
  breakoutDate: string | null;
  /** 직전 조정 지속 거래일 수. 보류 시 null */
  consolidationDays: number | null;
  /** 조정 구간 최대 근접도 (0~100 %, 소수 1자리). 보류 시 null */
  priorMaxRatio: number | null;
  /** 판정 보류 사유 (정상 판정 시 null) */
  breakoutReason: BreakoutReason;
}

export interface ScreenerFinancialStatus {
  count: number;
  hasDartKey: boolean;
}

export interface ScreenerResult {
  items: ScreenerItem[];
  total: number;
  sectors: string[];
  financialStatus: ScreenerFinancialStatus | null;
  collectedAt: string | null;
  isUpToDate: boolean;
}

export type ScreenerSortKey =
  | "high52wRatio"
  | "changeRate"
  | "price"
  | "volume"
  | "revenueGrowth"
  | "opGrowth"
  | "netGrowth"
  | "revenue"
  | "breakoutDate";
