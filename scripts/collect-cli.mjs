/**
 * OECD CLI 실제 데이터 수집
 * Korea: LOLITOAA (Amplitude Adjusted) — series dimension ADJUSTMENT=AA(1)
 * USA:   LOLITOAA (Amplitude Adjusted)
 *
 * 실행: node scripts/collect-cli.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';
const p = new PrismaClient();

const BASE = 'https://stats.oecd.org/sdmx-json/data/MEI_CLI';

// 디버깅으로 검증한 올바른 OECD 시리즈 키
// Korea: MEASURE=LOCOSP(13)+ADJUSTMENT=NOR(0) → BOK/FRED KORLOLITOAASTSAM과 일치 (2026-02=102.15)
// USA:   MEASURE=LI(0)+ADJUSTMENT=AA(1) → FRED USALOLITOAASTSAM
const KNOWN_SERIES = {
  KOR: '43:0:13:0:1:0:0:0:0',
  USA: '14:0:0:0:1:1:0:0:0',
};

async function fetchCountryCli(countryCode, startYear = 2020) {
  const url = `${BASE}/${countryCode}.LOLITOAA.STSA/OECD?startTime=${startYear}-01&format=json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const data  = json.data;
  const structs = data.structures[0];
  const ds    = data.dataSets[0];

  // TIME_PERIOD dimension — obs-level
  const timeDim = structs.dimensions.observation.find(d => d.id === 'TIME_PERIOD');
  const timeValues = timeDim.values; // [{id: "2026-05", ...}, ...]

  // REF_AREA dimension — find country index
  const refAreaDim = structs.dimensions.series.find(d => d.id === 'REF_AREA');
  const countryIdx = refAreaDim.values.findIndex(v => v.id === countryCode);
  if (countryIdx < 0) throw new Error(`Country ${countryCode} not found`);

  // ADJUSTMENT dimension index for AA (Amplitude Adjusted)
  const adjDim    = structs.dimensions.series.find(d => d.id === 'ADJUSTMENT');
  const aaIdx     = adjDim?.values.findIndex(v => v.id === 'AA') ?? 1;
  const measureDim = structs.dimensions.series.find(d => d.id === 'MEASURE');
  const liIdx     = measureDim?.values.findIndex(v => v.id === 'LI') ?? 0;

  // 모든 월별(FREQ=M) 시리즈 중 "가장 최신이고 CLI 범위값인" 시리즈 선택
  // 주요 CLI 기준: 2024년 이후 데이터 + 값 범위 95~110 + 레코드 수 최다
  const allSeriesKeys = Object.keys(ds.series);
  const candidates = [];

  for (const key of allSeriesKeys) {
    const parts = key.split(':');
    if (parseInt(parts[0]) !== countryIdx) continue;
    if (parts[1] !== '0') continue; // FREQ=M (index 0)

    const obs = ds.series[key].observations;
    if (Object.keys(obs).length === 0) continue;

    const obsArr = Object.entries(obs);
    // 시리즈마다 obs 인덱스 방향이 달라 → 모든 기간 문자열 중 최댓값이 최신
    const allPeriods = obsArr
      .map(([idx]) => timeValues[parseInt(idx)]?.id)
      .filter(p => p && /^\d{4}-\d{2}$/.test(p));
    if (allPeriods.length === 0) continue;
    allPeriods.sort();
    const latestPeriod = allPeriods.at(-1);
    const latestEntry = obsArr.find(([idx]) => timeValues[parseInt(idx)]?.id === latestPeriod);
    const latestVal = latestEntry?.[1]?.[0];

    // 2024년 이후 월별 데이터, CLI 값 범위 필터
    if (!/^\d{4}-\d{2}$/.test(latestPeriod)) continue;
    if (latestPeriod < '2024-01') continue;
    if (latestVal < 95 || latestVal > 115) continue;

    candidates.push({ key, obs, obsArr, latestPeriod, latestVal, count: obsArr.length });
  }

  // 우선순위: 최신 날짜 > 레코드 수(히스토리 길이) > LI measure 우선
  candidates.sort((a, b) => {
    if (b.latestPeriod !== a.latestPeriod) return b.latestPeriod.localeCompare(a.latestPeriod);
    if (b.count !== a.count) return b.count - a.count;
    const aLI = parseInt(a.key.split(':')[2]) === liIdx ? -1 : 1;
    const bLI = parseInt(b.key.split(':')[2]) === liIdx ? -1 : 1;
    return aLI - bLI;
  });

  // 검증된 시리즈가 있으면 우선 사용
  let bestSeries = null;
  if (KNOWN_SERIES[countryCode] && ds.series[KNOWN_SERIES[countryCode]]) {
    const knownKey = KNOWN_SERIES[countryCode];
    bestSeries = { key: knownKey, obs: ds.series[knownKey].observations };
    candidates.unshift({ key: knownKey, obs: ds.series[knownKey].observations, latestPeriod: '(known)', count: Object.keys(ds.series[knownKey].observations).length, latestVal: 0 });
  } else {
    bestSeries = candidates[0] ? { key: candidates[0].key, obs: candidates[0].obs } : null;
  }

  if (!bestSeries) throw new Error(`No suitable monthly CLI series found for ${countryCode}`);
  const usedKnown = KNOWN_SERIES[countryCode] === bestSeries.key ? ' [known]' : '';
  console.log(`  ${countryCode} series: ${bestSeries.key}${usedKnown} (${Object.keys(bestSeries.obs).length} obs)`);

  // obs key → time period → date + value (모든 obs 추출)
  const points = [];
  for (const [idxStr, valArr] of Object.entries(bestSeries.obs)) {
    const period = timeValues[parseInt(idxStr)]?.id;
    const value  = valArr[0];
    if (!period || typeof value !== 'number' || isNaN(value)) continue;
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    points.push({
      date:  new Date(`${period}-15T00:00:00.000Z`),
      value: parseFloat(value.toFixed(1)),
    });
  }

  // 날짜 기준 정렬 (중복 제거)
  const seen = new Set();
  const unique = points
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .filter(p => { const k = p.date.toISOString(); if (seen.has(k)) return false; seen.add(k); return true; });

  return unique;
}

async function upsertCli(type, points) {
  if (points.length === 0) { console.log(`  ${type}: 데이터 없음`); return; }
  await p.indicatorRecord.deleteMany({ where: { type } });
  await p.indicatorRecord.createMany({
    data: points.map(pt => ({ type, value: pt.value, recordedAt: pt.date })),
  });
  const rows = await p.indicatorRecord.findMany({ where: { type }, orderBy: { recordedAt: 'desc' }, take: 3 });
  const [cur, prev] = rows;
  const chg = prev ? ((cur.value - prev.value) / prev.value * 100).toFixed(2) : 'N/A';
  console.log(`  ✓ ${type}: ${points.length}개, 최신 ${cur.value} (${cur.recordedAt.toISOString().slice(0,7)}), 전월 변화: ${chg}%`);
}

console.log('OECD CLI 실제 데이터 수집 중...\n');
try {
  const [korData, usaData] = await Promise.allSettled([
    fetchCountryCli('KOR', 2020),
    fetchCountryCli('USA', 2020),
  ]);

  if (korData.status === 'fulfilled') {
    await upsertCli('CLI', korData.value);
  } else {
    console.error('KOR 실패:', korData.reason.message);
  }

  if (usaData.status === 'fulfilled') {
    await upsertCli('US_CLI', usaData.value);
  } else {
    console.error('USA 실패:', usaData.reason.message);
  }

  console.log('\n최근 3개월 비교:');
  for (const t of ['CLI', 'US_CLI']) {
    const rows = await p.indicatorRecord.findMany({ where:{type:t}, orderBy:{recordedAt:'desc'}, take:3 });
    console.log(`  ${t}: ${rows.map(r => r.recordedAt.toISOString().slice(0,7) + '=' + r.value).join(', ')}`);
  }
} finally {
  await p.$disconnect();
}
