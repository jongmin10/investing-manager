import type { CollectionJob } from "./collection-run";

export type TriggerType = "cron" | "chain" | "manual";

export interface JobDefinition {
  id: CollectionJob;
  name: string;
  url: string;
  schedule: string;
  trigger: TriggerType;
  description: string;
}

export const COLLECTION_JOBS: JobDefinition[] = [
  {
    id: "daily",
    name: "야간 오케스트레이터",
    url: "/api/cron/daily",
    schedule: "매일 07:00 KST",
    trigger: "cron",
    description: "경제지표·일봉 수집 직접 실행 후 하위 잡 체인 트리거",
  },
  {
    id: "refresh-universe",
    name: "유니버스 갱신",
    url: "/api/cron/refresh-universe",
    schedule: "daily 체인",
    trigger: "chain",
    description: "스크리너 유니버스 종목 목록 갱신 → collect-stocks 트리거",
  },
  {
    id: "stocks",
    name: "주가 스냅샷 수집",
    url: "/api/cron/collect-stocks",
    schedule: "daily 체인 (슬라이스)",
    trigger: "chain",
    description: "전 유니버스 주가·PER·PBR 수집 (40종목/슬라이스 self-chaining)",
  },
  {
    id: "financials",
    name: "DART 재무 수집",
    url: "/api/cron/collect-financials",
    schedule: "daily 체인 (슬라이스)",
    trigger: "chain",
    description: "전 유니버스 DART 재무제표 수집 (40종목/슬라이스 self-chaining)",
  },
  {
    id: "exports",
    name: "품목별 수출 수집",
    url: "/api/cron/collect-exports",
    schedule: "매월 1·11·21일 + 15~20일",
    trigger: "chain",
    description: "관세청 품목별 수출 통계 수집 (발표일에만 daily가 트리거)",
  },
  {
    id: "datacenter",
    name: "데이터센터 지표 수집",
    url: "/api/cron/collect-datacenter",
    schedule: "daily 체인",
    trigger: "chain",
    description: "EDGAR Capex 4사 + EIA 전력 수요 + baxtel.com DC 카운트 12개국",
  },
  {
    id: "gurus",
    name: "대가 13F 수집",
    url: "/api/gurus/collect",
    schedule: "수동",
    trigger: "manual",
    description: "SEC EDGAR 13F 대가 포트폴리오 수집 (분기 공시 후 수동 실행)",
  },
  {
    id: "history",
    name: "지수 히스토리 수집",
    url: "",
    schedule: "수동",
    trigger: "manual",
    description: "월수익률·MDD 계산용 지수 히스토리 백필 (수동 전용)",
  },
];
