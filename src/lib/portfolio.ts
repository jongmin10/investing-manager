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
// 실효 주식 비중(혼합형 look-through 포함)이 설문의 손실 허용 범위와 맞도록 설계:
// 안정형 ~4% / 안정추구형 ~11% / 위험중립형 ~35% / 적극투자형 ~47% / 공격투자형 ~70%
export const BASE_ALLOCATION: Record<RiskType, Allocation> = {
  CONSERVATIVE:          { guaranteed: 70, bond: 20, mixed: 10, equity: 0 },
  MODERATE_CONSERVATIVE: { guaranteed: 50, bond: 30, mixed: 15, equity: 5 },
  MODERATE:              { guaranteed: 20, bond: 30, mixed: 25, equity: 25 },
  AGGRESSIVE:            { guaranteed: 15, bond: 20, mixed: 30, equity: 35 },
  VERY_AGGRESSIVE:       { guaranteed: 5,  bond: 10, mixed: 25, equity: 60 },
};

// 퇴직연금 DC·IRP의 위험자산(주식형 펀드 등) 투자 한도.
// 채권혼합형(주식 40% 이하)은 안전자산, 적격 TDF는 한도 예외이므로 equity 자산군에만 적용한다.
export const MAX_EQUITY_PCT = 70;

// 성향별 배분 근거 (포트폴리오 화면 노출용)
export const ALLOCATION_RATIONALE: Record<RiskType, string[]> = {
  CONSERVATIVE: [
    "원리금보장 70%: 예금자보호 한도(1억 원) 내 정기예금·GIC 중심으로 원금 손실 가능성을 사실상 제거합니다.",
    "채권형 20% + 혼합형 10%: 금리 수익과 소폭의 초과수익을 더해 물가 상승에 따른 구매력 손실을 일부 방어합니다.",
    "실효 주식 비중 약 4%(혼합형 내 주식 포함), 예상 최대 낙폭 2~3% — '손실 절대 불가' 성향에 부합합니다.",
  ],
  MODERATE_CONSERVATIVE: [
    "원리금보장 50%: 자산의 절반을 확정금리에 두어 시장 급락 시에도 절반은 흔들리지 않습니다.",
    "채권 30%·혼합 15%·주식 5%로 실효 주식 비중 약 11% — 예상 최대 낙폭 5~7%로 '5% 이내 손실 허용' 범위에 맞춥니다.",
    "장기 기대수익은 과거 20년 데이터 기준 연 3%대 중반 — 원금 안정성을 지키면서 예금 단독 운용 대비 초과수익을 추구합니다.",
  ],
  MODERATE: [
    "주식 25% + 혼합 25%로 실효 주식 비중 약 35% — 성장자산과 안전자산을 절반 가까이 나눈 균형 배분입니다.",
    "원리금보장은 20%로 제한해 실질수익이 0%대인 자산에 과도하게 묶이지 않게 하고, 채권 30%가 변동성 완충을 담당합니다.",
    "예상 최대 낙폭 약 15% — '10~20% 손실 허용' 성향의 허용 범위 안에서 수익 기회를 넓힙니다.",
  ],
  AGGRESSIVE: [
    "주식 35% + 혼합 30%로 실효 주식 비중 약 47% — 성장자산이 절반가량을 차지해 장기 복리 수익을 우선합니다.",
    "채권 20%·원리금보장 15%는 급락장에서 저가 매수(리밸런싱) 재원으로 활용됩니다.",
    "예상 최대 낙폭 약 20~25%로 '상당한 위험 감수' 성향에 부합하며, 장기 기대수익은 과거 20년 데이터 기준 연 7~8% 수준입니다.",
  ],
  VERY_AGGRESSIVE: [
    "주식형 60%: 퇴직연금 DC·IRP의 위험자산 한도(70%) 안에서 성장자산을 최대화한 수준입니다.",
    "혼합형 25%(TDF 등)를 더해 실효 주식 비중은 약 70%에 이르지만, 규제상 위험자산 분류 기준은 준수합니다.",
    "예상 최대 낙폭 30% 이상을 전제로 하는 배분이므로 10년 이상 장기 투자를 권장합니다.",
  ],
};

export interface MarketSignal {
  key: string;
  message: string;
  severity: "info" | "warning" | "danger";
  allocationAdjust?: Partial<Allocation>; // 비율 조정 (합산 후 정규화)
}

// 지표 값은 결측 가능(null). null인 지표는 신호 평가에서 스킵하여
// "0 fallback → 신호 오발동"(예: CLI=0 → 경기수축 무조건 발동)을 방지한다.
export interface IndicatorValues {
  vix: number | null;
  cpi: number | null;
  usCpi: number | null;
  cli: number | null;
  // 직전 거래일 대비 변화율 %. route.ts에서 두 SP500 레코드의 recordedAt 간격이
  // 1거래일 범위(주말·공휴일 감안 4일)를 초과하면 null로 처리되어 여기 도달하지 않는다.
  // 즉 여기서는 항상 "정상 1거래일 변화"로 간주하고 SP500_DROP을 평가한다.
  sp500Change: number | null;
}

export function getMarketSignals(indicators: IndicatorValues): MarketSignal[] {
  const signals: MarketSignal[] = [];

  // 결측 지표(null)는 해당 분기를 평가하지 않고 스킵한다.
  if (indicators.vix !== null) {
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
  }

  if (indicators.cpi !== null && indicators.cpi >= 3) {
    signals.push({
      key: "CPI_HIGH",
      message: `한국 CPI ${indicators.cpi.toFixed(1)}% — 인플레이션 주의. 채권 비중 축소를 고려하세요.`,
      severity: "warning",
      allocationAdjust: { bond: -5, equity: +3, mixed: +2 },
    });
  }

  if (indicators.usCpi !== null && indicators.usCpi >= 3) {
    signals.push({
      key: "US_CPI_HIGH",
      message: `미국 CPI ${indicators.usCpi.toFixed(1)}% — 연준 긴축 압력. 달러 강세·원화 약세 주의.`,
      severity: "warning",
    });
  }

  if (indicators.cli !== null) {
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
  }

  if (indicators.sp500Change !== null && indicators.sp500Change <= -3) {
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
  // - total===0 가드: 0으로 나눠 NaN이 되는 것을 방지(이론상 BASE_ALLOCATION 합이 0일 수 없으나 방어).
  // - 4개 자산군 모두 factor로 스케일 후 round → 잔차를 equity에만 몰지 않는다(음수/편향 방지).
  // - 반올림 오차(diff = 100 - 합)는 "현재 비중이 가장 큰 자산군"에 흡수시켜 결과가 항상 ≥0, 합=100을 만족.
  const total = alloc.guaranteed + alloc.bond + alloc.mixed + alloc.equity;
  if (total === 0) {
    return { ...BASE_ALLOCATION[riskType] };
  }
  if (total !== 100) {
    const factor = 100 / total;
    alloc.guaranteed = Math.round(alloc.guaranteed * factor);
    alloc.bond       = Math.round(alloc.bond * factor);
    alloc.mixed      = Math.round(alloc.mixed * factor);
    alloc.equity     = Math.round(alloc.equity * factor);

    // 반올림 누적 오차를 가장 비중이 큰 자산군에 흡수 (모두 ≥0 유지)
    const diff = 100 - (alloc.guaranteed + alloc.bond + alloc.mixed + alloc.equity);
    if (diff !== 0) {
      const keys: (keyof Allocation)[] = ["guaranteed", "bond", "mixed", "equity"];
      const largest = keys.reduce((a, b) => (alloc[a] >= alloc[b] ? a : b));
      alloc[largest] = Math.max(0, alloc[largest] + diff);
    }
  }

  // 퇴직연금 위험자산 70% 한도 가드: 신호 조정이 중첩되어도 주식형이 MAX_EQUITY_PCT를
  // 넘지 않도록 초과분을 원리금보장으로 이전한다 (합계 100 유지).
  if (alloc.equity > MAX_EQUITY_PCT) {
    alloc.guaranteed += alloc.equity - MAX_EQUITY_PCT;
    alloc.equity = MAX_EQUITY_PCT;
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
  /** EtfReturnMap 조회 키 (상수 E 식별자). 수익률 값은 빌드 시 맵에서 해석. */
  returnKey: string;
}

// ETF 누적 수익률 — H5/L에서 DB(EtfReturn 모델)로 이전 완료.
//   - 정본(source of truth): EtfReturn 테이블. 조회는 getEtfReturnMap()(@/lib/etf-returns) 사용.
//   - 조립은 buildEtfRecommendations(riskType, allocation, returnMap)가 returnMap을 받아 수행.
//   - API(route.ts)가 DB 조회 → 조립 → 응답에 etfGroups 포함. (page.tsx 후속 연동 권장)
//
// 아래 FALLBACK_ETF_RETURNS는 DB 조회 실패/누락 키 대비 안전망이며, 값은 시드(prisma/seed-etf.ts)와
// 동일하다. getEtfRecommendations() 동기 래퍼가 이 fallback을 사용한다(프론트 하위호환 유지).
//
// ⚠️ 표시 주의:
//   - 수치는 "과거 실적"이며 미래 수익을 보장하지 않는다.
//   - 항목별 returnYears(측정 기간)가 서로 다르다(지수 20년 / MANUAL 8~10년 혼재).
//     → cumulativeReturn(누적)끼리 단순 비교 금지. 연환산(CAGR)으로만 상호 비교할 것.
//   - returnPeriod 문자열은 프론트 노출용 기간 표기이며 returnYears와 일치해야 한다.
//
// CAGR = (1 + cumulativeReturn/100)^(1/returnYears) - 1   ← buildEtfRecommendations에서 산출

/** ETF 수익률 값 (DB EtfReturn에서 추출한 계산용 3필드) */
export interface EtfReturnValue {
  cumulativeReturn: number;
  returnYears: number;
  returnPeriod: string;
}

/** 상수 E 식별자(key) → 수익률 값 맵. getEtfReturnMap()가 DB에서 이 형태로 반환한다. */
export type EtfReturnMap = Record<string, EtfReturnValue>;

// DB 조회 실패/누락 대비 fallback (시드 prisma/seed-etf.ts와 값 동일).
// 지수 3종은 PR #42 롤링 20년 재계산 결과의 스냅샷(기준일 2026-07), MANUAL 4종은 2026-06 수동 추정.
const FALLBACK_ETF_RETURNS: EtfReturnMap = {
  국채3년:        { cumulativeReturn: 31,     returnYears: 10,    returnPeriod: "10년" },
  미국30년국채H:  { cumulativeReturn: 22,     returnYears: 8,     returnPeriod: "8년 (설정이후)" },
  TDF2030:        { cumulativeReturn: 88,     returnYears: 9,     returnPeriod: "9년 (설정이후)" },
  혼합국채:       { cumulativeReturn: 92,     returnYears: 10,    returnPeriod: "10년" },
  SP500:          { cumulativeReturn: 837.3,  returnYears: 19.92, returnPeriod: "20년 (지수 산출)" },
  KOSPI200:       { cumulativeReturn: 640.6,  returnYears: 19.92, returnPeriod: "20년 (지수 산출)" },
  NASDAQ100:      { cumulativeReturn: 2932.1, returnYears: 19.92, returnPeriod: "20년 (지수 산출)" },
};

const ETF_DEFS: Partial<Record<keyof Allocation, {
  items: RawEtf[];
  byRisk?: Partial<Record<RiskType, RawEtf[]>>;
}>> = {
  bond: {
    items: [
      { name: "TIGER 국채3년",       ticker: "114260", description: "국내 3년 국고채 추종, 안정적 금리 수익",    weightInClass: 60, returnKey: "국채3년" },
      { name: "ACE 미국30년국채(H)", ticker: "304660", description: "미국 장기채, 환헤지로 환율 위험 최소화",   weightInClass: 40, returnKey: "미국30년국채H" },
    ],
  },
  mixed: {
    items: [
      { name: "TIGER TDF2030",         ticker: "394280", description: "생애주기형 자산 자동 배분 펀드",         weightInClass: 60, returnKey: "TDF2030" },
      { name: "KODEX 200미국채혼합",   ticker: "272580", description: "주식 30% + 채권 70% 균형 포트폴리오",   weightInClass: 40, returnKey: "혼합국채" },
    ],
  },
  equity: {
    items: [
      { name: "TIGER 미국S&P500", ticker: "360750", description: "미국 S&P500 우량 대형주", weightInClass: 50, returnKey: "SP500" },
      { name: "KODEX 200",        ticker: "069500", description: "KOSPI200 국내 대형주",    weightInClass: 50, returnKey: "KOSPI200" },
    ],
    byRisk: {
      CONSERVATIVE: [
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 60, returnKey: "KOSPI200" },
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 40, returnKey: "SP500" },
      ],
      MODERATE_CONSERVATIVE: [
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 50, returnKey: "KOSPI200" },
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 50, returnKey: "SP500" },
      ],
      MODERATE: [
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 45, returnKey: "SP500" },
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 35, returnKey: "KOSPI200" },
        { name: "TIGER 나스닥100",   ticker: "133690", description: "미국 나스닥100 성장·기술주",      weightInClass: 20, returnKey: "NASDAQ100" },
      ],
      AGGRESSIVE: [
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 40, returnKey: "SP500" },
        { name: "TIGER 나스닥100",   ticker: "133690", description: "미국 나스닥100 성장·기술주",      weightInClass: 35, returnKey: "NASDAQ100" },
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 25, returnKey: "KOSPI200" },
      ],
      VERY_AGGRESSIVE: [
        { name: "TIGER 나스닥100",   ticker: "133690", description: "미국 나스닥100 성장·기술주",      weightInClass: 50, returnKey: "NASDAQ100" },
        { name: "TIGER 미국S&P500",  ticker: "360750", description: "미국 S&P500 우량 대형주",        weightInClass: 35, returnKey: "SP500" },
        { name: "KODEX 200",         ticker: "069500", description: "KOSPI200 국내 대형주 대표 지수",  weightInClass: 15, returnKey: "KOSPI200" },
      ],
    },
  },
};

// ── 자산군 기대 CAGR (목표 수익률 역산·성향 카드 표시용) ──────────────
// 설계: docs/target-return-etf-recommendation-design.md §5.2, §6.1(targetSolver)

/** 원리금보장 연 수익률(%) — 정기예금·GIC 수준. page.tsx 수익률 분석과 공유. */
export const GUARANTEED_CAGR = 2.3;

/** 성향 앵커 순서 (위험 오름차순). 목표 역산의 t축 인덱스와 1:1 대응. */
export const RISK_TYPE_ORDER: RiskType[] = [
  "CONSERVATIVE",
  "MODERATE_CONSERVATIVE",
  "MODERATE",
  "AGGRESSIVE",
  "VERY_AGGRESSIVE",
];

export interface ClassCagrs {
  guaranteed: number;
  bond: number;
  mixed: number;
  /** RISK_TYPE_ORDER 순 성향별 equity 세트의 가중 CAGR(%) */
  equityByAnchor: number[];
}

// CAGR 환산 + 무효값 방어: cum ≤ -100(거듭제곱 밑수 음수) 또는 years ≤ 0(0 나눗셈)인
// 값은 무효로 보고 fallback으로 대체한다. fallback까지 무효면 0.
function safeCagr(key: string, returnMap: EtfReturnMap): number {
  const valid = (v?: EtfReturnValue) =>
    v && v.cumulativeReturn > -100 && v.returnYears > 0 ? v : undefined;
  const ret = valid(returnMap[key]) ?? valid(FALLBACK_ETF_RETURNS[key]);
  if (!ret) return 0;
  return (Math.pow(1 + ret.cumulativeReturn / 100, 1 / ret.returnYears) - 1) * 100;
}

function weightedCagr(items: RawEtf[], returnMap: EtfReturnMap): number {
  return items.reduce(
    (s, it) => s + (it.weightInClass / 100) * safeCagr(it.returnKey, returnMap),
    0
  );
}

/**
 * 자산군별 기대 CAGR(%). solveTargetAllocation(@/lib/target-allocation)의 입력이며,
 * 클라이언트 실시간 미리보기용으로 API 응답(targetSolver.classCagr)에도 포함된다.
 */
export function getClassCagrs(returnMap: EtfReturnMap): ClassCagrs {
  return {
    guaranteed: GUARANTEED_CAGR,
    bond: weightedCagr(ETF_DEFS.bond!.items, returnMap),
    mixed: weightedCagr(ETF_DEFS.mixed!.items, returnMap),
    equityByAnchor: RISK_TYPE_ORDER.map((rt) =>
      weightedCagr(ETF_DEFS.equity!.byRisk![rt] ?? ETF_DEFS.equity!.items, returnMap)
    ),
  };
}

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

/**
 * ETF 추천 조립 (순수 함수). 수익률 값은 returnMap(DB에서 조회한 EtfReturnMap)에서 해석한다.
 * 누락 키는 FALLBACK_ETF_RETURNS로 보강한다(표시 깨짐 방지).
 *
 * API(route.ts)에서 getEtfReturnMap()으로 맵을 조회해 이 함수에 주입하고 응답에 포함하는 것이 권장 경로.
 */
export function buildEtfRecommendations(
  riskType: RiskType,
  allocation: Allocation,
  returnMap: EtfReturnMap
): EtfGroup[] {
  const resolve = (key: string): EtfReturnValue =>
    returnMap[key] ?? FALLBACK_ETF_RETURNS[key] ?? { cumulativeReturn: 0, returnYears: 1, returnPeriod: "-" };

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

        const ret = resolve(item.returnKey);
        // 연평균 수익률(CAGR): 항목별 returnYears 기준으로 누적 수익률을 연환산.
        // returnPeriod(노출용 표기)와 returnYears(계산 기준)는 동일 기간을 가리킨다.
        const cagr = parseFloat(
          ((Math.pow(1 + ret.cumulativeReturn / 100, 1 / ret.returnYears) - 1) * 100).toFixed(1)
        );
        return {
          name: item.name, ticker: item.ticker, description: item.description,
          portfolioPct, classPct: item.weightInClass,
          cumulativeReturn: ret.cumulativeReturn, returnYears: ret.returnYears, returnPeriod: ret.returnPeriod,
          cagr,
        };
      });

      return { assetClass: key, label, color, allocationPct, isGuaranteed: false, etfs };
    });
}

/**
 * 동기 하위호환 래퍼. DB 조회 없이 FALLBACK_ETF_RETURNS로 조립한다.
 * page.tsx(클라이언트)가 이 함수를 직접 호출 중이라 유지한다.
 * 권장: API 응답의 etfGroups를 소비하도록 프론트 전환(후속 작업).
 */
export function getEtfRecommendations(riskType: RiskType, allocation: Allocation): EtfGroup[] {
  return buildEtfRecommendations(riskType, allocation, FALLBACK_ETF_RETURNS);
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
