import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IndicatorSeries = {
  type: string;
  frequency: "daily" | "monthly" | "event";
  baseValue: number;   // 평균 회귀 기준값
  volatility: number;  // 일별 표준편차
  reversion: number;   // 평균 회귀 속도 (0~1, 클수록 강하게 회귀)
  trend: number;       // 기간 전체 선형 트렌드 (양수 = 상승, 음수 = 하락)
};

const SERIES: IndicatorSeries[] = [
  // 기준금리: 3.5%에서 3.0%로 하락 추세 (인하 사이클)
  { type: "BOK_BASE_RATE", frequency: "event", baseValue: 3.25, volatility: 0, reversion: 1, trend: -0.5 },
  // 국고채 3년: 3.5% 중심
  { type: "GOV_BOND_3Y", frequency: "daily", baseValue: 3.5, volatility: 0.04, reversion: 0.05, trend: -0.3 },
  // 국고채 10년: 4.0% 중심
  { type: "GOV_BOND_10Y", frequency: "daily", baseValue: 4.0, volatility: 0.05, reversion: 0.05, trend: -0.2 },
  // 미국 기준금리: 5.5%에서 4.25%로 인하 사이클
  { type: "FED_RATE", frequency: "event", baseValue: 4.875, volatility: 0, reversion: 1, trend: -1.25 },
  // 미국 국채 2년: 4.5% 중심, 금리 인하 반영
  { type: "US_TREASURY_2Y", frequency: "daily", baseValue: 4.2, volatility: 0.05, reversion: 0.05, trend: -0.8 },
  // 미국 국채 10년: 4.3% 중심
  { type: "US_TREASURY_10Y", frequency: "daily", baseValue: 4.3, volatility: 0.06, reversion: 0.04, trend: -0.3 },
  // KOSPI: 2500~2700 범위
  { type: "KOSPI", frequency: "daily", baseValue: 2600, volatility: 25, reversion: 0.03, trend: 100 },
  // KOSDAQ: 720~780 범위
  { type: "KOSDAQ", frequency: "daily", baseValue: 750, volatility: 12, reversion: 0.04, trend: 30 },
  // S&P500: 4800~5400 범위
  { type: "SP500", frequency: "daily", baseValue: 5100, volatility: 50, reversion: 0.02, trend: 500 },
  // 나스닥100: 17000~21000 범위
  { type: "NASDAQ100", frequency: "daily", baseValue: 19000, volatility: 200, reversion: 0.02, trend: 3000 },
  // 필라델피아 반도체: 3500~5500 범위
  { type: "SOX", frequency: "daily", baseValue: 4500, volatility: 80, reversion: 0.03, trend: 1200 },
  // CPI: 3.5%에서 2.5%로 하락 (디스인플레이션)
  { type: "CPI", frequency: "monthly", baseValue: 3.0, volatility: 0.1, reversion: 0.15, trend: -1.0 },
  // PPI: 3.0%에서 2.0%로 하락
  { type: "PPI", frequency: "monthly", baseValue: 2.5, volatility: 0.15, reversion: 0.15, trend: -1.0 },
  // 환율: 1300~1380 범위
  { type: "KRW_USD", frequency: "daily", baseValue: 1340, volatility: 6, reversion: 0.04, trend: -30 },
  // CLI: 99~101 범위
  { type: "CLI", frequency: "monthly", baseValue: 100.0, volatility: 0.3, reversion: 0.2, trend: 0 },
  // 실업률: 3.0~3.3% 범위
  { type: "UNEMPLOYMENT", frequency: "monthly", baseValue: 3.1, volatility: 0.06, reversion: 0.2, trend: 0 },
  // 미국 CPI: 4.0%에서 2.6%로 하락 (디스인플레이션)
  { type: "US_CPI", frequency: "monthly", baseValue: 3.3, volatility: 0.12, reversion: 0.15, trend: -1.4 },
  // 미국 PPI: 3.5%에서 2.0%로 하락
  { type: "US_PPI", frequency: "monthly", baseValue: 2.75, volatility: 0.18, reversion: 0.15, trend: -1.5 },
  // 미국 실업률: 3.5%에서 4.2%로 소폭 상승
  { type: "US_UNEMPLOYMENT", frequency: "monthly", baseValue: 3.85, volatility: 0.08, reversion: 0.15, trend: 0.7 },
  // VIX: 16~24 범위
  { type: "VIX", frequency: "daily", baseValue: 18, volatility: 1.5, reversion: 0.08, trend: 0 },
  // Fear & Greed: 35~65 범위, VIX와 역의 상관관계
  { type: "FEAR_GREED", frequency: "daily", baseValue: 52, volatility: 5, reversion: 0.06, trend: 0 },
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
    // 기준금리: 분기별 (1,4,7,10월 두번째 목요일)
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
      // 기준금리: 이벤트 기반, 계단식 변화
      const steps = n;
      const totalChange = series.trend;
      const startVal = series.baseValue - totalChange / 2;
      let val = startVal;
      const changePerStep = totalChange / (steps - 1 || 1);

      for (let i = 0; i < dates.length; i++) {
        if (i > 0 && i % Math.max(1, Math.floor(steps / 4)) === 0) {
          val += changePerStep * Math.floor(steps / 4);
        }
        // 0.25% 단위로 반올림
        const rounded = Math.round(val * 4) / 4;
        records.push({ type: series.type, value: parseFloat(rounded.toFixed(2)), recordedAt: dates[i] });
      }
      continue;
    }

    // 평균 회귀 랜덤 워크
    // 시작값 = baseValue - trend/2 (trend는 3년 전체 변화량)
    const startMean = series.baseValue - series.trend / 2;
    const endMean = series.baseValue + series.trend / 2;
    let value = startMean;

    for (let i = 0; i < dates.length; i++) {
      const progress = i / Math.max(n - 1, 1);
      const targetMean = startMean + (endMean - startMean) * progress;

      // Ornstein-Uhlenbeck: 평균 회귀 + 노이즈
      value = value + series.reversion * (targetMean - value) + series.volatility * randn();

      // 지표별 합리적 범위 클램핑
      if (series.type === "GOV_BOND_3Y") value = Math.max(1.0, Math.min(6.0, value));
      if (series.type === "GOV_BOND_10Y") value = Math.max(1.5, Math.min(7.0, value));
      if (series.type === "US_TREASURY_2Y") value = Math.max(1.0, Math.min(6.0, value));
      if (series.type === "US_TREASURY_10Y") value = Math.max(1.5, Math.min(6.5, value));
      if (series.type === "US_CPI" || series.type === "US_PPI") value = Math.max(-1.0, Math.min(9.0, value));
      if (series.type === "US_UNEMPLOYMENT") value = Math.max(2.5, Math.min(8.0, value));
      if (series.type === "VIX") value = Math.max(10, Math.min(45, value));
      if (series.type === "UNEMPLOYMENT") value = Math.max(1.5, Math.min(6.0, value));
      if (series.type === "CPI" || series.type === "PPI") value = Math.max(-1.0, Math.min(8.0, value));
      if (series.type === "KOSPI") value = Math.max(1800, Math.min(3500, value));
      if (series.type === "KOSDAQ") value = Math.max(550, Math.min(1100, value));
      if (series.type === "SP500") value = Math.max(3500, Math.min(7000, value));
      if (series.type === "NASDAQ100") value = Math.max(12000, Math.min(25000, value));
      if (series.type === "SOX") value = Math.max(2500, Math.min(7000, value));
      if (series.type === "KRW_USD") value = Math.max(1150, Math.min(1500, value));
      if (series.type === "CLI") value = Math.max(97, Math.min(104, value));
      if (series.type === "FEAR_GREED") value = Math.max(0, Math.min(100, value));

      const dp = ["GOV_BOND_3Y", "GOV_BOND_10Y", "US_TREASURY_2Y", "US_TREASURY_10Y", "CPI", "PPI", "CLI", "UNEMPLOYMENT", "US_CPI", "US_PPI", "US_UNEMPLOYMENT"].includes(series.type) ? 2
        : ["KOSPI", "KOSDAQ", "SP500", "NASDAQ100", "SOX", "DOW", "KRW_USD"].includes(series.type) ? 1
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

  // 현재값 샘플 출력
  const latest = await prisma.indicatorRecord.groupBy({
    by: ["type"],
    _max: { recordedAt: true },
  });
  const types = latest.map((l) => l.type);
  for (const t of types) {
    const r = await prisma.indicatorRecord.findFirst({
      where: { type: t },
      orderBy: { recordedAt: "desc" },
    });
    if (r) console.log(`  ${t.padEnd(20)} ${r.value}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
