export type EventType =
  | "FOMC"
  | "BOK_MPC"
  | "US_CPI"
  | "US_NFP"
  | "KR_CPI"
  | "KR_EMPLOYMENT";

export type Importance = "HIGH" | "MEDIUM" | "LOW";

export interface EconomicEvent {
  key: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  title: string;
  description: string;
  importance: Importance;
  indicatorTypes?: string[];
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  FOMC: "FOMC",
  BOK_MPC: "금통위",
  US_CPI: "미국 CPI",
  US_NFP: "미국 고용",
  KR_CPI: "한국 CPI",
  KR_EMPLOYMENT: "한국 고용",
};

export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  FOMC: "#ef4444",
  BOK_MPC: "#3b82f6",
  US_CPI: "#f97316",
  US_NFP: "#8b5cf6",
  KR_CPI: "#10b981",
  KR_EMPLOYMENT: "#06b6d4",
};

export const ECONOMIC_EVENTS: EconomicEvent[] = [
  // ── 2026년 5~6월 (과거) ──────────────────────────────────
  {
    key: "2026-05-29-bok-mpc",
    date: "2026-05-29",
    type: "BOK_MPC",
    title: "한국은행 금통위 (5월)",
    description: "한국은행 금융통화위원회 기준금리 결정 회의",
    importance: "HIGH",
    indicatorTypes: ["BOK_BASE_RATE"],
  },
  {
    key: "2026-06-05-us-nfp",
    date: "2026-06-05",
    type: "US_NFP",
    title: "미국 고용보고서 (5월)",
    description: "5월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-06-05-kr-cpi",
    date: "2026-06-05",
    type: "KR_CPI",
    title: "한국 소비자물가 (5월)",
    description: "5월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-06-10-us-cpi",
    date: "2026-06-10",
    type: "US_CPI",
    title: "미국 CPI (5월)",
    description: "5월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-06-16-fomc",
    date: "2026-06-16",
    type: "FOMC",
    title: "미 FOMC 회의 (6월)",
    description: "연방공개시장위원회 통화정책 결정 (6월 16~17일)",
    importance: "HIGH",
    indicatorTypes: ["FED_RATE"],
  },
  {
    key: "2026-06-19-kr-employment",
    date: "2026-06-19",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (5월)",
    description: "5월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
  // ── 2026년 7월 ──────────────────────────────────
  {
    key: "2026-07-02-us-nfp",
    date: "2026-07-02",
    type: "US_NFP",
    title: "미국 고용보고서 (6월)",
    description: "6월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-07-02-kr-cpi",
    date: "2026-07-02",
    type: "KR_CPI",
    title: "한국 소비자물가 (6월)",
    description: "6월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-07-10-bok-mpc",
    date: "2026-07-10",
    type: "BOK_MPC",
    title: "한국은행 금통위 (7월)",
    description: "한국은행 금융통화위원회 기준금리 결정 회의",
    importance: "HIGH",
    indicatorTypes: ["BOK_BASE_RATE"],
  },
  {
    key: "2026-07-14-us-cpi",
    date: "2026-07-14",
    type: "US_CPI",
    title: "미국 CPI (6월)",
    description: "6월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-07-17-kr-employment",
    date: "2026-07-17",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (6월)",
    description: "6월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
  {
    key: "2026-07-28-fomc",
    date: "2026-07-28",
    type: "FOMC",
    title: "미 FOMC 회의 (7월)",
    description: "연방공개시장위원회 통화정책 결정 (7월 28~29일)",
    importance: "HIGH",
    indicatorTypes: ["FED_RATE"],
  },
  // ── 2026년 8월 ──────────────────────────────────
  {
    key: "2026-08-05-kr-cpi",
    date: "2026-08-05",
    type: "KR_CPI",
    title: "한국 소비자물가 (7월)",
    description: "7월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-08-07-us-nfp",
    date: "2026-08-07",
    type: "US_NFP",
    title: "미국 고용보고서 (7월)",
    description: "7월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-08-12-us-cpi",
    date: "2026-08-12",
    type: "US_CPI",
    title: "미국 CPI (7월)",
    description: "7월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-08-19-kr-employment",
    date: "2026-08-19",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (7월)",
    description: "7월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
  {
    key: "2026-08-28-bok-mpc",
    date: "2026-08-28",
    type: "BOK_MPC",
    title: "한국은행 금통위 (8월)",
    description: "한국은행 금융통화위원회 기준금리 결정 회의",
    importance: "HIGH",
    indicatorTypes: ["BOK_BASE_RATE"],
  },
  // ── 2026년 9월 ──────────────────────────────────
  {
    key: "2026-09-03-kr-cpi",
    date: "2026-09-03",
    type: "KR_CPI",
    title: "한국 소비자물가 (8월)",
    description: "8월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-09-04-us-nfp",
    date: "2026-09-04",
    type: "US_NFP",
    title: "미국 고용보고서 (8월)",
    description: "8월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-09-11-us-cpi",
    date: "2026-09-11",
    type: "US_CPI",
    title: "미국 CPI (8월)",
    description: "8월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-09-15-fomc",
    date: "2026-09-15",
    type: "FOMC",
    title: "미 FOMC 회의 (9월)",
    description: "연방공개시장위원회 통화정책 결정 (9월 15~16일)",
    importance: "HIGH",
    indicatorTypes: ["FED_RATE"],
  },
  {
    key: "2026-09-18-kr-employment",
    date: "2026-09-18",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (8월)",
    description: "8월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
  // ── 2026년 10월 ──────────────────────────────────
  {
    key: "2026-10-01-kr-cpi",
    date: "2026-10-01",
    type: "KR_CPI",
    title: "한국 소비자물가 (9월)",
    description: "9월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-10-02-us-nfp",
    date: "2026-10-02",
    type: "US_NFP",
    title: "미국 고용보고서 (9월)",
    description: "9월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-10-14-us-cpi",
    date: "2026-10-14",
    type: "US_CPI",
    title: "미국 CPI (9월)",
    description: "9월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-10-16-bok-mpc",
    date: "2026-10-16",
    type: "BOK_MPC",
    title: "한국은행 금통위 (10월)",
    description: "한국은행 금융통화위원회 기준금리 결정 회의",
    importance: "HIGH",
    indicatorTypes: ["BOK_BASE_RATE"],
  },
  {
    key: "2026-10-16-kr-employment",
    date: "2026-10-16",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (9월)",
    description: "9월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
  {
    key: "2026-10-27-fomc",
    date: "2026-10-27",
    type: "FOMC",
    title: "미 FOMC 회의 (10월)",
    description: "연방공개시장위원회 통화정책 결정 (10월 27~28일)",
    importance: "HIGH",
    indicatorTypes: ["FED_RATE"],
  },
  // ── 2026년 11월 ──────────────────────────────────
  {
    key: "2026-11-05-kr-cpi",
    date: "2026-11-05",
    type: "KR_CPI",
    title: "한국 소비자물가 (10월)",
    description: "10월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-11-06-us-nfp",
    date: "2026-11-06",
    type: "US_NFP",
    title: "미국 고용보고서 (10월)",
    description: "10월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-11-12-us-cpi",
    date: "2026-11-12",
    type: "US_CPI",
    title: "미국 CPI (10월)",
    description: "10월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-11-18-kr-employment",
    date: "2026-11-18",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (10월)",
    description: "10월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
  {
    key: "2026-11-27-bok-mpc",
    date: "2026-11-27",
    type: "BOK_MPC",
    title: "한국은행 금통위 (11월)",
    description: "한국은행 금융통화위원회 기준금리 결정 회의",
    importance: "HIGH",
    indicatorTypes: ["BOK_BASE_RATE"],
  },
  // ── 2026년 12월 ──────────────────────────────────
  {
    key: "2026-12-03-kr-cpi",
    date: "2026-12-03",
    type: "KR_CPI",
    title: "한국 소비자물가 (11월)",
    description: "11월 소비자물가지수(CPI) 발표",
    importance: "HIGH",
    indicatorTypes: ["CPI"],
  },
  {
    key: "2026-12-04-us-nfp",
    date: "2026-12-04",
    type: "US_NFP",
    title: "미국 고용보고서 (11월)",
    description: "11월 비농업 신규 고용·실업률 발표",
    importance: "HIGH",
    indicatorTypes: ["US_UNEMPLOYMENT"],
  },
  {
    key: "2026-12-09-fomc",
    date: "2026-12-09",
    type: "FOMC",
    title: "미 FOMC 회의 (12월)",
    description: "연방공개시장위원회 통화정책 결정 (12월 9~10일)",
    importance: "HIGH",
    indicatorTypes: ["FED_RATE"],
  },
  {
    key: "2026-12-10-us-cpi",
    date: "2026-12-10",
    type: "US_CPI",
    title: "미국 CPI (11월)",
    description: "11월 미국 소비자물가지수 발표",
    importance: "HIGH",
    indicatorTypes: ["US_CPI"],
  },
  {
    key: "2026-12-17-kr-employment",
    date: "2026-12-17",
    type: "KR_EMPLOYMENT",
    title: "한국 고용 통계 (11월)",
    description: "11월 고용·실업률 발표",
    importance: "MEDIUM",
    indicatorTypes: ["UNEMPLOYMENT"],
  },
];

export function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateStr);
  eventDate.setHours(0, 0, 0, 0);
  return Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
