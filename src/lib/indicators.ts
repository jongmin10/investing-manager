export type IndicatorType =
  | "BOK_BASE_RATE"
  | "GOV_BOND_3Y"
  | "GOV_BOND_10Y"
  | "FED_RATE"
  | "US_TREASURY_2Y"
  | "US_TREASURY_10Y"
  | "KOSPI"
  | "KOSDAQ"
  | "SP500"
  | "NASDAQ100"
  | "SOX"
  | "CPI"
  | "PPI"
  | "KRW_USD"
  | "CLI"
  | "UNEMPLOYMENT"
  | "US_CPI"
  | "US_PPI"
  | "US_UNEMPLOYMENT"
  | "VIX"
  | "FEAR_GREED";

export type UpdateFrequency = "realtime" | "daily" | "monthly" | "event";

export interface IndicatorMeta {
  type: IndicatorType;
  name: string;
  unit: string;
  source: string;
  frequency: UpdateFrequency;
  description: string; // 툴팁: 왜 중요한가
  glossary: string; // 용어사전: 상세 설명
  anomalyThreshold?: { value: number; direction: "above" | "below" };
  decimalPlaces: number;
}

export const INDICATORS: Record<IndicatorType, IndicatorMeta> = {
  BOK_BASE_RATE: {
    type: "BOK_BASE_RATE",
    name: "한국은행 기준금리",
    unit: "%",
    source: "한국은행 Open API",
    frequency: "event",
    description: "한국은행 금융통화위원회가 결정하는 정책금리. 모든 금융상품 금리의 기준이 됩니다.",
    glossary:
      "한국은행이 시중 유동성을 조절하기 위해 결정하는 금리입니다. 기준금리가 오르면 대출금리·예금금리도 함께 올라 소비·투자가 위축되고, 내리면 반대 효과가 발생합니다. 퇴직연금 채권형 상품의 수익률에 직접 영향을 줍니다.",
    decimalPlaces: 2,
  },
  GOV_BOND_3Y: {
    type: "GOV_BOND_3Y",
    name: "국고채 3년",
    unit: "%",
    source: "금융투자협회",
    frequency: "daily",
    description: "만기 3년짜리 국채 금리. 단기 시장금리 흐름과 채권형 펀드 수익률의 기준입니다.",
    glossary:
      "정부가 발행하는 채권 중 만기 3년물의 유통 금리입니다. 안전자산의 대표 지표로, 채권형·혼합형 펀드의 수익률 벤치마크로 활용됩니다. 금리 상승 시 채권 가격이 하락해 채권형 펀드 수익률이 낮아집니다.",
    decimalPlaces: 2,
  },
  GOV_BOND_10Y: {
    type: "GOV_BOND_10Y",
    name: "국고채 10년",
    unit: "%",
    source: "금융투자협회",
    frequency: "daily",
    description: "만기 10년짜리 국채 금리. 장기 경제 전망과 인플레이션 기대를 반영합니다.",
    glossary:
      "정부가 발행하는 채권 중 만기 10년물의 유통 금리입니다. 장기 금리 수준을 나타내며, 경기 전망이 좋을수록 높아지는 경향이 있습니다. 3년물 대비 10년물 금리 차이(스프레드)로 경기 사이클을 진단할 수 있습니다.",
    decimalPlaces: 2,
  },
  FED_RATE: {
    type: "FED_RATE",
    name: "미국 기준금리 (Fed)",
    unit: "%",
    source: "미국 연방준비제도",
    frequency: "event",
    description: "FOMC가 결정하는 미국 정책금리. 전 세계 금리의 기준으로 글로벌 자금 흐름을 좌우합니다.",
    glossary:
      "미국 연방공개시장위원회(FOMC)가 연 8회 결정하는 정책금리(Federal Funds Rate)입니다. 달러 기축통화 지위로 인해 미국 기준금리는 전 세계 채권·주식·환율 시장에 가장 큰 영향을 미칩니다. 금리 인상 시 신흥국 자금 이탈·원화 약세 압력이 커지고, 인하 시에는 반대 효과가 나타납니다.",
    decimalPlaces: 2,
  },
  US_TREASURY_2Y: {
    type: "US_TREASURY_2Y",
    name: "미국 국채 2년",
    unit: "%",
    source: "미국 재무부",
    frequency: "daily",
    description: "단기 미국 국채 금리. Fed 금리 정책 방향을 가장 민감하게 반영합니다.",
    glossary:
      "만기 2년짜리 미국 국채의 유통 금리입니다. 연준의 금리 인상·인하 기대를 가장 빠르게 반영하므로 '정책금리 기대 지표'로 불립니다. 2년물과 10년물의 금리 차이(장단기 스프레드)가 역전되면 경기침체 선행 신호로 해석됩니다.",
    decimalPlaces: 2,
  },
  US_TREASURY_10Y: {
    type: "US_TREASURY_10Y",
    name: "미국 국채 10년",
    unit: "%",
    source: "미국 재무부",
    frequency: "daily",
    description: "글로벌 장기금리의 기준. 전 세계 자산가격 할인율에 직접 영향을 줍니다.",
    glossary:
      "만기 10년짜리 미국 국채의 유통 금리로, 전 세계에서 가장 중요한 금리 지표입니다. 주식 가치평가의 할인율로 사용되어 금리 상승 시 성장주·기술주 주가에 부정적입니다. 한국 원화·신흥국 통화 흐름에도 직접 영향을 주며, 환율 전망 시 반드시 참고해야 합니다.",
    decimalPlaces: 2,
  },
  KOSPI: {
    type: "KOSPI",
    name: "KOSPI",
    unit: "pt",
    source: "KRX",
    frequency: "realtime",
    description: "한국 주식시장 대표 지수. 국내 주식형 펀드의 성과를 가늠하는 기준입니다.",
    glossary:
      "한국거래소에 상장된 전체 주식의 시가총액을 지수화한 것입니다. 삼성전자·SK하이닉스 등 대형주 비중이 높아 수출 경기에 민감합니다. 퇴직연금 내 국내주식형 펀드의 성과와 밀접하게 연동됩니다.",
    decimalPlaces: 0,
  },
  KOSDAQ: {
    type: "KOSDAQ",
    name: "KOSDAQ",
    unit: "pt",
    source: "KRX",
    frequency: "realtime",
    description: "중소·벤처기업 중심의 한국 주식시장 지수. 성장주·기술주 흐름을 반영합니다.",
    glossary:
      "코스닥은 중소기업·벤처기업 위주의 주식시장으로, IT·바이오·게임 등 성장 산업 비중이 높습니다. KOSPI보다 변동성이 크며, 위험 선호도가 높은 시기에 아웃퍼폼하는 경향이 있습니다.",
    decimalPlaces: 0,
  },
  SP500: {
    type: "SP500",
    name: "S&P 500",
    unit: "pt",
    source: "공개 주식 API",
    frequency: "realtime",
    description: "미국 대표 주가지수. 글로벌 투자 심리와 해외주식형 펀드 수익률의 기준점입니다.",
    glossary:
      "미국 뉴욕증권거래소·나스닥에 상장된 500개 대기업의 주가를 시가총액으로 가중 평균한 지수입니다. 애플·마이크로소프트·엔비디아 등 글로벌 빅테크 비중이 크며, 세계 증시 방향성을 이끄는 경우가 많습니다.",
    decimalPlaces: 0,
  },
  NASDAQ100: {
    type: "NASDAQ100",
    name: "나스닥 100",
    unit: "pt",
    source: "공개 주식 API",
    frequency: "realtime",
    description: "미국 나스닥 상위 100개 비금융 기업 지수. 빅테크·AI 성장 흐름을 직접 반영합니다.",
    glossary:
      "나스닥100(NDX)은 나스닥에 상장된 시가총액 상위 100개 비금융 기업으로 구성된 지수입니다. 애플·엔비디아·마이크로소프트·메타 등 AI·반도체·클라우드 기업 비중이 매우 높아 기술주 흐름을 가장 잘 나타냅니다. 해외주식형(기술주) 펀드의 주요 벤치마크입니다.",
    decimalPlaces: 0,
  },
  SOX: {
    type: "SOX",
    name: "필라델피아 반도체 (SOX)",
    unit: "pt",
    source: "공개 주식 API",
    frequency: "realtime",
    description: "미국 주요 반도체 기업 30개로 구성된 지수. 반도체 사이클과 AI 투자 강도를 반영합니다.",
    glossary:
      "필라델피아 반도체 지수(PHLX Semiconductor Sector Index, SOX)는 인텔·엔비디아·TSMC·ASML 등 글로벌 반도체 대표 기업 30개의 주가로 산출합니다. 반도체는 전방산업(스마트폰·서버·자동차)의 경기를 3~6개월 선행하는 특성이 있어 경기 사이클 예측에 활용됩니다. 국내 SK하이닉스·삼성전자와도 높은 상관관계를 보입니다.",
    decimalPlaces: 0,
  },
  CPI: {
    type: "CPI",
    name: "소비자물가지수 (CPI)",
    unit: "%",
    source: "통계청",
    frequency: "monthly",
    description: "가계가 구입하는 상품·서비스 가격 변동률. 인플레이션 강도를 나타냅니다.",
    glossary:
      "소비자물가지수(Consumer Price Index)는 일반 가계가 소비하는 상품·서비스 약 460개 품목의 가격 변화를 측정한 지표입니다. 연간 변화율(%YoY)로 표시하며, 중앙은행의 금리 결정에 핵심 역할을 합니다. CPI가 높으면 금리 인상 압력이 커집니다.",
    anomalyThreshold: { value: 3, direction: "above" },
    decimalPlaces: 1,
  },
  PPI: {
    type: "PPI",
    name: "생산자물가지수 (PPI)",
    unit: "%",
    source: "통계청",
    frequency: "monthly",
    description: "기업이 판매하는 상품의 가격 변동률. 미래 소비자물가의 선행지표입니다.",
    glossary:
      "생산자물가지수(Producer Price Index)는 기업이 다른 기업에 판매하는 상품·서비스의 평균 가격 변화를 측정합니다. CPI보다 먼저 발표되며, 향후 소비자물가 방향을 예측하는 선행지표로 활용됩니다.",
    decimalPlaces: 1,
  },
  KRW_USD: {
    type: "KRW_USD",
    name: "원/달러 환율",
    unit: "원",
    source: "서울외국환중개",
    frequency: "realtime",
    description: "1달러를 사기 위해 필요한 원화 금액. 해외투자 수익과 수입물가에 영향을 줍니다.",
    glossary:
      "원달러 환율은 외화 1달러를 구매하는 데 필요한 원화 금액입니다. 환율이 오르면(원화 약세) 해외주식형 펀드의 원화 환산 수익이 늘고, 수입 물가가 올라 인플레이션 압력이 커집니다. 반대로 환율이 내리면 해외 투자 손실이 발생할 수 있습니다.",
    decimalPlaces: 0,
  },
  CLI: {
    type: "CLI",
    name: "경기선행지수 (CLI)",
    unit: "",
    source: "통계청 / OECD",
    frequency: "monthly",
    description: "6~9개월 후 경기 방향을 예측하는 지수. 100 이상이면 경기 회복세를 의미합니다.",
    glossary:
      "경기선행지수(Composite Leading Indicator)는 앞으로 6~9개월 후의 경기 흐름을 예측하는 선행 통계입니다. OECD가 주요국별로 발표하며, 100을 기준으로 위에 있으면 경기 확장, 아래면 수축 국면입니다. 지수 방향성(상승/하락)이 절대값보다 중요합니다.",
    decimalPlaces: 1,
  },
  UNEMPLOYMENT: {
    type: "UNEMPLOYMENT",
    name: "실업률",
    unit: "%",
    source: "통계청",
    frequency: "monthly",
    description: "경제활동인구 중 일자리를 구하지 못한 비율. 경기와 역의 상관관계를 가집니다.",
    glossary:
      "실업률은 경제활동인구(취업자 + 실업자) 중 실업자가 차지하는 비율입니다. 실업률이 낮으면 고용 시장이 건강하다는 의미지만, 지나치게 낮으면 임금 상승 → 인플레이션 압력으로 이어질 수 있습니다. 미국의 경우 연준의 금리 결정에도 큰 영향을 줍니다.",
    decimalPlaces: 1,
  },
  US_CPI: {
    type: "US_CPI",
    name: "미국 CPI",
    unit: "%",
    source: "미국 노동통계국 (BLS)",
    frequency: "monthly",
    description: "미국 소비자물가 상승률. 연준 금리 결정의 핵심 지표이며 연 2%가 목표입니다.",
    glossary:
      "미국 노동통계국(BLS)이 발표하는 소비자물가지수(CPI) 전년 대비 변화율입니다. 연준의 물가 목표는 2%(PCE 기준이나 CPI와 유사)이며, CPI가 목표를 크게 상회하면 금리 인상·유지 압력이 높아집니다. 미국 CPI 발표일에는 전 세계 채권·주식·환율 시장이 큰 폭으로 움직이는 경향이 있습니다.",
    anomalyThreshold: { value: 3, direction: "above" },
    decimalPlaces: 1,
  },
  US_PPI: {
    type: "US_PPI",
    name: "미국 PPI",
    unit: "%",
    source: "미국 노동통계국 (BLS)",
    frequency: "monthly",
    description: "미국 생산자물가 상승률. 미국 CPI의 선행지표로 인플레이션 압력을 사전에 파악합니다.",
    glossary:
      "미국 생산자물가지수(PPI)는 기업 간 거래 가격의 변화를 측정하며, 소비자물가(CPI)보다 1~2개월 앞서 발표됩니다. PPI가 오르면 수개월 후 CPI 상승으로 이어지는 경향이 있어 선행 인플레이션 지표로 활용됩니다.",
    decimalPlaces: 1,
  },
  US_UNEMPLOYMENT: {
    type: "US_UNEMPLOYMENT",
    name: "미국 실업률",
    unit: "%",
    source: "미국 노동통계국 (BLS)",
    frequency: "monthly",
    description: "미국 고용 건강도 지표. 연준의 이중 책무(물가안정·최대고용) 중 하나를 반영합니다.",
    glossary:
      "매월 첫 번째 금요일에 발표되는 미국 고용보고서(Non-Farm Payrolls)와 함께 발표됩니다. 연준은 물가안정과 최대고용이라는 이중 책무를 갖고 있어, 실업률이 낮을수록 금리 인하에 소극적입니다. 예상치 대비 큰 편차가 나올 경우 글로벌 증시·환율에 즉각적인 충격을 줍니다.",
    decimalPlaces: 1,
  },
  VIX: {
    type: "VIX",
    name: "VIX 공포지수",
    unit: "",
    source: "CBOE",
    frequency: "realtime",
    description: "향후 30일 미국 증시 변동성 예측치. 20 이상이면 불안, 30 이상이면 공포 수준입니다.",
    glossary:
      "VIX(Volatility Index)는 시카고옵션거래소(CBOE)가 산출하는 S&P 500 옵션의 내재 변동성 지수로, '공포지수'라고도 불립니다. 통상 VIX 20 이하를 안정, 20~30을 주의, 30 이상을 공포 구간으로 판단합니다. VIX가 급등하면 안전자산(채권·금)으로의 자금 이동을 고려할 수 있습니다.",
    anomalyThreshold: { value: 30, direction: "above" },
    decimalPlaces: 1,
  },
  FEAR_GREED: {
    type: "FEAR_GREED",
    name: "Fear & Greed 지수",
    unit: "",
    source: "CNN Business",
    frequency: "daily",
    description: "0~100 사이 투자 심리 지수. 25 이하 극단적 공포, 75 이상 극단적 탐욕을 의미합니다.",
    glossary:
      "CNN Business가 산출하는 시장 심리 지수로 0(극단적 공포)에서 100(극단적 탐욕) 사이의 값을 가집니다. 주가 모멘텀·변동성·풋/콜 비율·안전자산 수요 등 7가지 지표를 종합해 계산합니다. 일반적으로 공포 구간(0~25)에서 매수, 탐욕 구간(75~100)에서 비중 축소를 고려하는 역발상 투자 신호로 활용됩니다. VIX와 보완적으로 함께 보면 시장 과열·과냉 여부를 더 정확히 판단할 수 있습니다.",
    anomalyThreshold: { value: 25, direction: "below" },
    decimalPlaces: 0,
  },
};

export const INDICATOR_TYPES = Object.keys(INDICATORS) as IndicatorType[];

export function formatValue(type: IndicatorType, value: number): string {
  const meta = INDICATORS[type];
  const formatted = value.toFixed(meta.decimalPlaces);
  if (meta.unit === "%") return `${formatted}%`;
  if (meta.unit === "원") return `${Number(formatted).toLocaleString()}원`;
  if (meta.unit === "pt") return Number(formatted).toLocaleString();
  return formatted;
}

export function isAnomaly(type: IndicatorType, value: number): boolean {
  const { anomalyThreshold } = INDICATORS[type];
  if (!anomalyThreshold) return false;
  return anomalyThreshold.direction === "above"
    ? value >= anomalyThreshold.value
    : value <= anomalyThreshold.value;
}
