// 피터 린치 종목분석 — 백엔드·프론트 공용 API 계약 (단일 출처).
// docs/peter-lynch-feature-spec.md §5 확정 계약. 임의 변경 금지.

// GET/POST /api/lynch/[ticker] 공통 응답
export interface LynchResponse {
  ticker: string; // "005930"
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  status: "pending" | "done" | "failed";
  analyzedAt: string | null; // ISO, done일 때
  result: LynchResult | null;
  dataLimitations: string[]; // 확인불가 항목 라벨 (프론트 경고 표시)
  error?: string;
}

export interface LynchResult {
  categories: { type: SixCategory; weightPct: number | null; rationale: string }[]; // 1~2개
  checklist: LynchMetric[]; // 고정 7
  twoMinuteDrill: {
    whatItSells: string;
    whosBuying: string;
    howItMakesMoney: string;
    biggestRisk: string;
  };
  greenFlags: LynchFlag[]; // 고정 6
  redFlags: LynchFlag[]; // 고정 5
  verdict: { action: "BUY" | "HOLD" | "SELL"; rationale: string };
  validation: { weakestAssumption: string; sources: [string, string] };
}

export type SixCategory =
  | "SLOW_GROWER"
  | "STALWART"
  | "FAST_GROWER"
  | "CYCLICAL"
  | "ASSET_PLAY"
  | "TURNAROUND"; // 프론트가 label/color 매핑

export type LynchMetricKey =
  | "PEG"
  | "DEBT_TO_EQUITY"
  | "CASH_TO_MCAP"
  | "EPS_CAGR_3Y"
  | "OP_MARGIN_TREND"
  | "INSIDER_TRADING"
  | "BUYBACK_TREND";

export interface LynchMetric {
  key: LynchMetricKey;
  label: string;
  value: string | null; // 포맷된 문자열 "0.8x" / null=확인불가
  numericValue: number | null; // 색상·정렬용 원시값
  lynchCriterion: string;
  result: "PASS" | "FAIL" | "NA";
  comment: string;
  source: string; // "2024A DART" | "NAVER" | "공시에서 확인 불가"
}

export interface LynchFlag {
  label: string;
  result: "PASS" | "FAIL" | "NA";
  comment: string;
}
