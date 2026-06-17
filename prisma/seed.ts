import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IndicatorSeries = {
  type: string;
  frequency: "daily" | "monthly" | "event";
  baseValue: number;   // 평균 회귀 기준값 (3년 평균)
  volatility: number;  // 일별 표준편차
  reversion: number;   // 평균 회귀 속도 (0~1, 클수록 강하게 회귀)
  trend: number;       // 3년 전체 선형 트렌드 (양수 = 상승, 음수 = 하락)
};

// 기준: 2026년 6월 17일 실제 시장값 기반 보정
// startMean = baseValue - trend/2  (3년 전 시작값)
// endMean   = baseValue + trend/2  (현재 도달 목표값)
const SERIES: IndicatorSeries[] = [
  // ── 금리 ─────────────────────────────────────────────────
  // BOK 기준금리: 3.50% → 2.50% (총 100bp 인하, 실제 2026-06 기준 2.50%)
  { type: "BOK_BASE_RATE", frequency: "event", baseValue: 3.0, volatility: 0, reversion: 1, trend: -1.0 },
  // 국고채 3년: 3.30% → 2.70% (BOK 인하 반영)
  { type: "GOV_BOND_3Y", frequency: "daily", baseValue: 3.0, volatility: 0.04, reversion: 0.05, trend: -0.6 },
  // 국고채 10년: 3.80% → 3.10%
  { type: "GOV_BOND_10Y", frequency: "daily", baseValue: 3.45, volatility: 0.05, reversion: 0.05, trend: -0.7 },
  // 미국 기준금리: 5.50% → 3.50% (총 200bp 인하, 실제 2026-06 FOMC 3.50-3.75% 동결)
  { type: "FED_RATE", frequency: "event", baseValue: 4.5, volatility: 0, reversion: 1, trend: -2.0 },
  // 미국 국채 2년: 4.80% → 3.70%
  { type: "US_TREASURY_2Y", frequency: "daily", baseValue: 4.25, volatility: 0.05, reversion: 0.05, trend: -1.1 },
  // 미국 국채 10년: 4.80% → 4.10%
  { type: "US_TREASURY_10Y", frequency: "daily", baseValue: 4.45, volatility: 0.06, reversion: 0.04, trend: -0.7 },

  // ── 주가지수 ──────────────────────────────────────────────
  // KOSPI: 2,500 → 8,000 (반도체·AI 랠리, 삼성전자+436% / SK하이닉스+1000%)
  { type: "KOSPI", frequency: "daily", baseValue: 5250, volatility: 120, reversion: 0.03, trend: 5500 },
  // KOSDAQ: 700 → 1,030
  { type: "KOSDAQ", frequency: "daily", baseValue: 865, volatility: 20, reversion: 0.04, trend: 330 },
  // S&P 500: 4,500 → 7,534 (2026년 YTD +10%)
  { type: "SP500", frequency: "daily", baseValue: 6017, volatility: 75, reversion: 0.02, trend: 3034 },
  // 나스닥100: 16,000 → 30,000 (AI 빅테크 주도)
  { type: "NASDAQ100", frequency: "daily", baseValue: 23000, volatility: 350, reversion: 0.02, trend: 14000 },
  // 필라델피아 반도체(SOX): 3,200 → 8,000 (반도체 슈퍼사이클)
  { type: "SOX", frequency: "daily", baseValue: 5600, volatility: 150, reversion: 0.03, trend: 4800 },

  // ── 물가 ─────────────────────────────────────────────────
  // 한국 CPI: 3.50% → 2.30% (디스인플레이션)
  { type: "CPI", frequency: "monthly", baseValue: 2.9, volatility: 0.1, reversion: 0.15, trend: -1.2 },
  // 한국 PPI: 3.00% → 2.00%
  { type: "PPI", frequency: "monthly", baseValue: 2.5, volatility: 0.15, reversion: 0.15, trend: -1.0 },
  // 미국 CPI: 4.50% → 3.30% (실제 2026년 5월 3.3%)
  { type: "US_CPI", frequency: "monthly", baseValue: 3.9, volatility: 0.12, reversion: 0.15, trend: -1.2 },
  // 미국 PPI: 4.00% → 2.50%
  { type: "US_PPI", frequency: "monthly", baseValue: 3.25, volatility: 0.18, reversion: 0.15, trend: -1.5 },

  // ── 기타 거시지표 ─────────────────────────────────────────
  // 원/달러: 1,300 → 1,513 (원화 약세 지속, 실제 2026-06 약 1,514원)
  { type: "KRW_USD", frequency: "daily", baseValue: 1406, volatility: 8, reversion: 0.04, trend: 213 },
  // 한국 경기선행지수: 100 중심
  { type: "CLI", frequency: "monthly", baseValue: 100.0, volatility: 0.3, reversion: 0.2, trend: 0 },
  // 미국 경기선행지수: AI 호황 이후 이란 충격으로 소폭 하락
  { type: "US_CLI", frequency: "monthly", baseValue: 100.4, volatility: 0.25, reversion: 0.2, trend: 0 },
  // 한국 실업률: 3.00% → 2.70% (고용 안정)
  { type: "UNEMPLOYMENT", frequency: "monthly", baseValue: 2.85, volatility: 0.06, reversion: 0.2, trend: -0.3 },
  // 미국 실업률: 3.50% → 4.50% (노동시장 점진적 냉각)
  { type: "US_UNEMPLOYMENT", frequency: "monthly", baseValue: 4.0, volatility: 0.08, reversion: 0.15, trend: 1.0 },
  // VIX: 20 → 16 (상승장 안정 국면, 실제 약 15.8)
  { type: "VIX", frequency: "daily", baseValue: 18, volatility: 1.5, reversion: 0.08, trend: -4 },
  // Fear & Greed: 45 → 65 (상승장 탐욕 국면)
  { type: "FEAR_GREED", frequency: "daily", baseValue: 55, volatility: 5, reversion: 0.06, trend: 20 },
];

function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateDates(
  frequency: "daily" | "monthly" | "event",
  fromDate: Date,
  toDate: Date
): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(fromDate);

  if (frequency === "daily") {
    while (cursor <= toDate) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (frequency === "monthly") {
    cursor.setDate(15);
    while (cursor <= toDate) {
      dates.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    // 기준금리: 분기별 (1,4,7,10월 두번째 목요일 근사)
    for (let y = fromDate.getFullYear(); y <= toDate.getFullYear(); y++) {
      for (const m of [0, 3, 6, 9]) {
        const d = new Date(y, m, 12);
        if (d >= fromDate && d <= toDate) dates.push(d);
      }
    }
  }

  return dates;
}

async function main() {
  console.log("Seeding database...");
  await prisma.indicatorRecord.deleteMany();

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 3);

  const records: { type: string; value: number; recordedAt: Date }[] = [];

  for (const series of SERIES) {
    const dates = generateDates(series.frequency, fromDate, toDate);
    const n = dates.length;

    if (series.type === "BOK_BASE_RATE" || series.type === "FED_RATE") {
      // 기준금리: 계단식 변화 (0.25% 단위)
      const steps = n;
      const totalChange = series.trend;
      const startVal = series.baseValue - totalChange / 2;
      let val = startVal;
      const changePerStep = totalChange / (steps - 1 || 1);

      for (let i = 0; i < dates.length; i++) {
        if (i > 0 && i % Math.max(1, Math.floor(steps / 4)) === 0) {
          val += changePerStep * Math.floor(steps / 4);
        }
        const rounded = Math.round(val * 4) / 4;
        records.push({ type: series.type, value: parseFloat(rounded.toFixed(2)), recordedAt: dates[i] });
      }
      continue;
    }

    // 평균 회귀 랜덤 워크 (Ornstein-Uhlenbeck)
    const startMean = series.baseValue - series.trend / 2;
    const endMean = series.baseValue + series.trend / 2;
    let value = startMean;

    for (let i = 0; i < dates.length; i++) {
      const progress = i / Math.max(n - 1, 1);
      const targetMean = startMean + (endMean - startMean) * progress;

      value = value + series.reversion * (targetMean - value) + series.volatility * randn();

      // 지표별 합리적 범위 클램핑 (2026년 6월 기준 실제값 반영)
      if (series.type === "GOV_BOND_3Y")    value = Math.max(1.0, Math.min(6.0, value));
      if (series.type === "GOV_BOND_10Y")   value = Math.max(1.5, Math.min(7.0, value));
      if (series.type === "US_TREASURY_2Y") value = Math.max(1.0, Math.min(6.5, value));
      if (series.type === "US_TREASURY_10Y")value = Math.max(1.5, Math.min(7.0, value));
      if (series.type === "US_CPI")         value = Math.max(-1.0, Math.min(9.0, value));
      if (series.type === "US_PPI")         value = Math.max(-1.0, Math.min(9.0, value));
      if (series.type === "US_UNEMPLOYMENT")value = Math.max(2.5, Math.min(8.0, value));
      if (series.type === "VIX")            value = Math.max(10, Math.min(50, value));
      if (series.type === "UNEMPLOYMENT")   value = Math.max(1.5, Math.min(6.0, value));
      if (series.type === "CPI")            value = Math.max(-1.0, Math.min(8.0, value));
      if (series.type === "PPI")            value = Math.max(-1.0, Math.min(8.0, value));
      if (series.type === "KOSPI")          value = Math.max(2000, Math.min(12000, value));
      if (series.type === "KOSDAQ")         value = Math.max(500, Math.min(1500, value));
      if (series.type === "SP500")          value = Math.max(3500, Math.min(9500, value));
      if (series.type === "NASDAQ100")      value = Math.max(12000, Math.min(40000, value));
      if (series.type === "SOX")            value = Math.max(2000, Math.min(12000, value));
      if (series.type === "KRW_USD")        value = Math.max(1150, Math.min(1700, value));
      if (series.type === "CLI")            value = Math.max(97, Math.min(104, value));
      if (series.type === "US_CLI")         value = Math.max(97, Math.min(104, value));
      if (series.type === "FEAR_GREED")     value = Math.max(0, Math.min(100, value));

      const dp = ["GOV_BOND_3Y", "GOV_BOND_10Y", "US_TREASURY_2Y", "US_TREASURY_10Y",
                  "CPI", "PPI", "CLI", "UNEMPLOYMENT", "US_CPI", "US_PPI", "US_UNEMPLOYMENT"].includes(series.type) ? 2
        : ["KOSPI", "KOSDAQ", "SP500", "NASDAQ100", "SOX", "KRW_USD"].includes(series.type) ? 1
        : 2;

      records.push({
        type: series.type,
        value: parseFloat(value.toFixed(dp)),
        recordedAt: dates[i],
      });
    }
  }

  await prisma.indicatorRecord.createMany({ data: records });
  console.log(`✓ ${records.length} records inserted.`);

  // 최신값 확인 출력
  console.log("\n── 최신 지표값 ──");
  const latest = await prisma.indicatorRecord.groupBy({ by: ["type"], _max: { recordedAt: true } });
  for (const l of latest) {
    const r = await prisma.indicatorRecord.findFirst({
      where: { type: l.type },
      orderBy: { recordedAt: "desc" },
    });
    if (r) console.log(`  ${l.type.padEnd(22)} ${String(r.value).padStart(10)}  (${r.recordedAt.toISOString().slice(0, 10)})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
