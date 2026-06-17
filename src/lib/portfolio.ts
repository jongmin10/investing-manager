export type RiskType =
  | "CONSERVATIVE"
  | "MODERATE_CONSERVATIVE"
  | "MODERATE"
  | "AGGRESSIVE"
  | "VERY_AGGRESSIVE";

export const RISK_TYPE_LABEL: Record<RiskType, string> = {
  CONSERVATIVE: "안정형",
  MODERATE_CONSERVATIVE: "안정추구형",
  MODERATE: "위험중립형",
  AGGRESSIVE: "적극투자형",
  VERY_AGGRESSIVE: "공격투자형",
};

export const RISK_TYPE_DESC: Record<RiskType, string> = {
  CONSERVATIVE: "원금 보전을 최우선으로 하며, 낮은 수익률을 감수하더라도 안정성을 중시합니다.",
  MODERATE_CONSERVATIVE: "안정성을 중시하되 일부 수익도 추구합니다. 소폭의 손실은 수용 가능합니다.",
  MODERATE: "수익과 안정의 균형을 추구합니다. 중간 수준의 위험을 감수합니다.",
  AGGRESSIVE: "적극적인 수익 추구를 위해 상당한 위험을 감수할 수 있습니다.",
  VERY_AGGRESSIVE: "최대 수익을 위해 높은 변동성과 큰 손실 가능성도 수용합니다.",
};

export interface Allocation {
  guaranteed: number; // 원리금보장
  bond: number;       // 채권형
  mixed: number;      // 혼합형
  equity: number;     // 주식형
}

// 기본 자산 배분 (시장 신호 반영 전)
export const BASE_ALLOCATION: Record<RiskType, Allocation> = {
  CONSERVATIVE:          { guaranteed: 70, bond: 20, mixed: 10, equity: 0 },
  MODERATE_CONSERVATIVE: { guaranteed: 50, bond: 30, mixed: 15, equity: 5 },
  MODERATE:              { guaranteed: 30, bond: 30, mixed: 25, equity: 15 },
  AGGRESSIVE:            { guaranteed: 15, bond: 20, mixed: 30, equity: 35 },
  VERY_AGGRESSIVE:       { guaranteed: 5,  bond: 10, mixed: 25, equity: 60 },
};

export interface MarketSignal {
  key: string;
  message: string;
  severity: "info" | "warning" | "danger";
  allocationAdjust?: Partial<Allocation>; // 비율 조정 (합산 후 정규화)
}

interface IndicatorValues {
  vix: number;
  cpi: number;
  usCpi: number;
  cli: number;
  sp500Change: number; // 전일 대비 변화율 %
}

export function getMarketSignals(indicators: IndicatorValues): MarketSignal[] {
  const signals: MarketSignal[] = [];

  if (indicators.vix >= 30) {
    signals.push({
      key: "VIX_HIGH",
      message: `VIX ${indicators.vix.toFixed(1)} — 시장 공포 수준. 안전자산 비중 확대를 검토하세요.`,
      severity: "danger",
      allocationAdjust: { guaranteed: +10, equity: -10 },
    });
  } else if (indicators.vix >= 20) {
    signals.push({
      key: "VIX_ELEVATED",
      message: `VIX ${indicators.vix.toFixed(1)} — 변동성 주의 구간. 포트폴리오 점검이 필요합니다.`,
      severity: "warning",
    });
  }

  if (indicators.cpi >= 3) {
    signals.push({
      key: "CPI_HIGH",
      message: `한국 CPI ${indicators.cpi.toFixed(1)}% — 인플레이션 주의. 채권 비중 축소를 고려하세요.`,
      severity: "warning",
      allocationAdjust: { bond: -5, equity: +3, mixed: +2 },
    });
  }

  if (indicators.usCpi >= 3) {
    signals.push({
      key: "US_CPI_HIGH",
      message: `미국 CPI ${indicators.usCpi.toFixed(1)}% — 연준 긴축 압력. 달러 강세·원화 약세 주의.`,
      severity: "warning",
    });
  }

  if (indicators.cli > 101) {
    signals.push({
      key: "CLI_EXPANSION",
      message: `경기선행지수 ${indicators.cli.toFixed(1)} — 경기 확장 신호. 주식 비중 소폭 확대 고려.`,
      severity: "info",
      allocationAdjust: { equity: +5, guaranteed: -5 },
    });
  } else if (indicators.cli < 99) {
    signals.push({
      key: "CLI_CONTRACTION",
      message: `경기선행지수 ${indicators.cli.toFixed(1)} — 경기 수축 신호. 방어적 자산 비중 유지.`,
      severity: "warning",
    });
  }

  if (indicators.sp500Change <= -3) {
    signals.push({
      key: "SP500_DROP",
      message: `S&P500 ${indicators.sp500Change.toFixed(1)}% 하락. 글로벌 증시 하락 압력 주의.`,
      severity: "warning",
      allocationAdjust: { guaranteed: +5, equity: -5 },
    });
  }

  return signals;
}

export function applySignals(riskType: RiskType, signals: MarketSignal[]): Allocation {
  const alloc = { ...BASE_ALLOCATION[riskType] };

  for (const signal of signals) {
    if (!signal.allocationAdjust) continue;
    const { guaranteed = 0, bond = 0, mixed = 0, equity = 0 } = signal.allocationAdjust;
    alloc.guaranteed = Math.max(0, alloc.guaranteed + guaranteed);
    alloc.bond       = Math.max(0, alloc.bond + bond);
    alloc.mixed      = Math.max(0, alloc.mixed + mixed);
    alloc.equity     = Math.max(0, alloc.equity + equity);
  }

  // 합계 100% 정규화
  const total = alloc.guaranteed + alloc.bond + alloc.mixed + alloc.equity;
  if (total !== 100) {
    const factor = 100 / total;
    alloc.guaranteed = Math.round(alloc.guaranteed * factor);
    alloc.bond       = Math.round(alloc.bond * factor);
    alloc.mixed      = Math.round(alloc.mixed * factor);
    alloc.equity     = 100 - alloc.guaranteed - alloc.bond - alloc.mixed;
  }

  return alloc;
}

// 설문 점수 → 성향 분류
export function scoreToRiskType(score: number): RiskType {
  if (score <= 8)  return "CONSERVATIVE";
  if (score <= 11) return "MODERATE_CONSERVATIVE";
  if (score <= 14) return "MODERATE";
  if (score <= 17) return "AGGRESSIVE";
  return "VERY_AGGRESSIVE";
}

// ── ETF 추천 ──────────────────────────────────────────────

interface RawEtf {
  name: string;
  ticker: string;
  description: string;
  weightInClass: number; // 자산군 내 비중 (합계 100)
  /** 누적 수익률 (%) */
  cumulativeReturn: number;
  /** 측정 기간 (년 수) — CAGR 계산에 사용 */
  returnYears: number;
  /** 수익률 기간 표기 (예: "10년", "6년 설정이후") */
  returnPeriod: string;
}

// ETF 누적 수익률 (기준: 2026-06, 지수 기반 추정치)
// 출처: KOSPI·S&P500·NASDAQ 100 실제 지수 성과 + KRW/USD 변동 반영
// CAGR = (1 + return/100)^(1/years) - 1
const E = {
  국채3년:        { cumulativeReturn: 31,  returnYears: 10, returnPeriod: "10년" },
  미국30년국채H:  { cumulativeReturn: 22,  returnYears: 8,  returnPeriod: "8년 (설정이후)" },
  TDF2030:        { cumulativeReturn: 88,  returnYears: 9,  returnPeriod: "9년 (설정이후)" },
  혼합국채:       { cumulativeReturn: 92,  returnYears: 10, returnPeriod: "10년" },
  SP500:          { cumulativeReturn: 198, returnYears: 6,  returnPeriod: "6년 (설정이후)" },
  KOSPI200:       { cumulativeReturn: 315, returnYears: 10, returnPeriod: "10년" },
  NASDAQ100:      { cumulativeReturn: 612, returnYears: 10, returnPeriod: "10년" },
};

const ETF_DEFS: Partial<Record<keyof Allocation, {
  items: RawEtf[];
  byRisk?: Partial<Record<RiskType, RawEtf[]>>;
}>> = {
  bond: {
    items: [
      { name: "TIGER 국채3년",       ticker: "114260", description: "국내 3년 국고채 추종, 안정적 금리 수익",    weightInClass: 60, ...E.국채3년 },
      { name: "ACE 미국30년국채(H)", ticker: "304660", description: "미국 장기채, 환헤지로 환율 위험 최소화",   weightInClass: 40, ...E.미국30년국채H },
    ],
  },
  mixed: {
    items: [
      { name: "TIGER TDF2030",         ticker: "394280", description: "생애주기형 자산 자동 배분 펀드",         weightInClass: 60, ...E.TDF2030 },
      { name: "KODEX 200미국채혼합",   ticker: "272580", description: "주식 30% + 채권 70% 균형 포트폴리오",   weightInClass: 40, ...E.혼합국채 },
    ],
  },
  equity: {
    items: [
      { name: "TIGER 미국S&P500", ticker: "360750", description: "미국 S&P500 우량 대형주", weightInClass: 50, ...E.SP500 },
      { name: "KODEX 200",        ticker: "069500", description: "KOSPI200 국내 대형주",    weightInClass: 50, ...E.KOSPI200 },
    ],
    byRisk: {
      CONSERVATIVE: [
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 60, ...E.KOSPI200 },
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 40, ...E.SP500 },
      ],
      MODERATE_CONSERVATIVE: [
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 50, ...E.KOSPI200 },
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 50, ...E.SP500 },
      ],
      MODERATE: [
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 45, ...E.SP500 },
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 35, ...E.KOSPI200 },
        { name: "TIGER 나스닥100",   ticker: "133690", description: "미국 나스닥100 성장·기술주",      weightInClass: 20, ...E.NASDAQ100 },
      ],
      AGGRESSIVE: [
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 40, ...E.SP500 },
        { name: "TIGER 나스닥100",   ticker: "133690", description: "미국 나스닥100 성장·기술주",      weightInClass: 35, ...E.NASDAQ100 },
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 25, ...E.KOSPI200 },
      ],
      VERY_AGGRESSIVE: [
        { name: "TIGER 나스닥100",   ticker: "133690", description: "미국 나스닥100 성장·기술주",      weightInClass: 50, ...E.NASDAQ100 },
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 35, ...E.SP500 },
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 15, ...E.KOSPI200 },
      ],
    },
  },
};

export interface EtfRecommendedItem {
  name: string;
  ticker: string;
  description: string;
  portfolioPct: number;       // 전체 포트폴리오 내 비중
  classPct: number;           // 자산군 내 비중
  cumulativeReturn: number;   // 누적 수익률 (%)
  returnYears: number;        // 측정 기간 (년)
  returnPeriod: string;       // 수익률 기간 표기
  cagr: number;               // 연평균 수익률 CAGR (%)
}

export interface EtfGroup {
  assetClass: keyof Allocation;
  label: string;
  color: string;
  allocationPct: number;
  isGuaranteed: boolean;
  etfs: EtfRecommendedItem[];
}

const ASSET_CLASS_META: Array<{ key: keyof Allocation; label: string; color: string }> = [
  { key: "guaranteed", label: "원리금보장", color: "#3b82f6" },
  { key: "bond",       label: "채권형",    color: "#10b981" },
  { key: "mixed",      label: "혼합형",    color: "#f59e0b" },
  { key: "equity",     label: "주식형",    color: "#ef4444" },
];

export function getEtfRecommendations(riskType: RiskType, allocation: Allocation): EtfGroup[] {
  return ASSET_CLASS_META
    .filter(({ key }) => allocation[key] > 0)
    .map(({ key, label, color }) => {
      const allocationPct = allocation[key];

      if (key === "guaranteed") {
        return { assetClass: key, label, color, allocationPct, isGuaranteed: true, etfs: [] };
      }

      const def = ETF_DEFS[key]!;
      const rawItems: RawEtf[] = (key === "equity" ? def.byRisk?.[riskType] : undefined) ?? def.items;

      let usedPct = 0;
      const etfs: EtfRecommendedItem[] = rawItems.map((item, idx) => {
        const isLast = idx === rawItems.length - 1;
        const portfolioPct = isLast
          ? allocationPct - usedPct
          : Math.round((allocationPct * item.weightInClass) / 100);
        usedPct += portfolioPct;
        const cagr = parseFloat(
          ((Math.pow(1 + item.cumulativeReturn / 100, 1 / item.returnYears) - 1) * 100).toFixed(1)
        );
        return { name: item.name, ticker: item.ticker, description: item.description, portfolioPct, classPct: item.weightInClass, cumulativeReturn: item.cumulativeReturn, returnYears: item.returnYears, returnPeriod: item.returnPeriod, cagr };
      });

      return { assetClass: key, label, color, allocationPct, isGuaranteed: false, etfs };
    });
}

// 설문 문항
export const SURVEY_QUESTIONS = [
  {
    id: 1,
    question: "투자 목적은 무엇인가요?",
    options: [
      { label: "원금을 절대 잃으면 안 된다", score: 1 },
      { label: "원금 보전하면서 약간의 수익", score: 2 },
      { label: "안정적인 중간 수익", score: 3 },
      { label: "적극적인 자산 성장", score: 4 },
    ],
  },
  {
    id: 2,
    question: "퇴직까지 남은 기간은 얼마나 되나요?",
    options: [
      { label: "5년 미만", score: 1 },
      { label: "5~10년", score: 2 },
      { label: "10~20년", score: 3 },
      { label: "20년 이상", score: 4 },
    ],
  },
  {
    id: 3,
    question: "투자금의 최대 손실 허용 범위는?",
    options: [
      { label: "손실 절대 불가", score: 1 },
      { label: "5% 이내", score: 2 },
      { label: "10~20%", score: 3 },
      { label: "30% 이상도 감수 가능", score: 4 },
    ],
  },
  {
    id: 4,
    question: "투자 경험 수준은?",
    options: [
      { label: "전혀 없음", score: 1 },
      { label: "예금·채권 위주", score: 2 },
      { label: "주식·펀드 경험 있음", score: 3 },
      { label: "파생상품 등 고위험 투자 경험", score: 4 },
    ],
  },
  {
    id: 5,
    question: "주가가 20% 하락했을 때 어떻게 하시겠어요?",
    options: [
      { label: "즉시 전부 매도한다", score: 1 },
      { label: "일부 매도해 손실을 줄인다", score: 2 },
      { label: "현 비중을 유지한다", score: 3 },
      { label: "추가 매수 기회로 삼는다", score: 4 },
    ],
  },
];
