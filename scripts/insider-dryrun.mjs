// 내부자 자발/총 순매수 분리 dry-run — DB 쓰기 없음.
// 같은 날(rcept_dt) 매수(증가) 보고가 BULK_GRANT_MIN_REPORTS 이상이면
// 그 날의 증가분 전체를 '일괄부여 추정'으로 보고 자발적 순매수에서 제외한다.
//
// 실행: node scripts/insider-dryrun.mjs
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
const DART_BASE = "https://opendart.fss.or.kr/api";
const KEY = process.env.DART_API_KEY;

// ── 임계 상수 (dart-collector.ts와 동일해야 함) ──
const BULK_GRANT_MIN_REPORTS = 5; // 같은 날 매수 보고 ≥5건이면 일괄부여 추정

function toQty(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (t === "" || t === "-") return null;
  let triangleNeg = false;
  if (/^[△▽]/.test(t)) { triangleNeg = true; t = t.slice(1); }
  t = t.replace(/,/g, "").trim();
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return triangleNeg ? -Math.abs(n) : n;
}
function normalizeDartDate(d) {
  return /^\d{8}$/.test(d) ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
}

// 기존 로직 (총 순매수만)
function aggregateOld(rows, cutoffStr) {
  let net = 0, buy = 0, sell = 0, any = false;
  for (const r of rows) {
    if (!r.rcept_dt || normalizeDartDate(r.rcept_dt) < cutoffStr) continue;
    const q = toQty(r.sp_stock_lmp_irds_cnt);
    if (q == null || q === 0) continue;
    any = true;
    net += q;
    if (q > 0) buy++; else sell++;
  }
  return any ? { net, buy, sell } : null;
}

// 신규 로직 (총 + 자발 분리)
function aggregateNew(rows, cutoffStr) {
  // 6개월 윈도우 내 유효 건만
  const valid = [];
  for (const r of rows) {
    if (!r.rcept_dt || normalizeDartDate(r.rcept_dt) < cutoffStr) continue;
    const q = toQty(r.sp_stock_lmp_irds_cnt);
    if (q == null || q === 0) continue;
    valid.push({ date: normalizeDartDate(r.rcept_dt), q });
  }
  if (valid.length === 0) return null;

  let net = 0, buy = 0, sell = 0;
  for (const v of valid) { net += v.q; if (v.q > 0) buy++; else sell++; }

  // rcept_dt별 그룹핑 → 같은 날 매수(증가) 보고 ≥임계 → 그 날 증가분 전체 제외
  const byDate = new Map();
  for (const v of valid) {
    if (!byDate.has(v.date)) byDate.set(v.date, []);
    byDate.get(v.date).push(v.q);
  }
  let bulkGrantQty = 0;   // 제외할 일괄부여 추정 증가분 합
  let bulkGrantCount = 0; // 일괄부여로 분류된 보고 건수
  const bulkDates = [];
  for (const [date, qs] of byDate) {
    const buyReports = qs.filter((q) => q > 0);
    if (buyReports.length >= BULK_GRANT_MIN_REPORTS) {
      const sum = buyReports.reduce((a, b) => a + b, 0);
      bulkGrantQty += sum;
      bulkGrantCount += buyReports.length;
      bulkDates.push({ date, count: buyReports.length, sum });
    }
  }
  const voluntaryNet = net - bulkGrantQty;
  return { net, buy, sell, voluntaryNet, bulkGrantQty, bulkGrantCount, bulkDates };
}

async function fetchElestock(dartCode) {
  const url = `${DART_BASE}/elestock.json?crtfc_key=${KEY}&corp_code=${dartCode}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const d = await res.json();
  if (d.status !== "000" || !(d.list?.length)) return d.status === "013" ? { empty: true } : null;
  return d.list;
}

function verdict(volNet) {
  if (volNet == null) return "NA";
  if (volNet > 0) return "PASS";
  if (volNet < 0) return "FAIL";
  return "NA";
}
function verdictOld(net) {
  if (net == null) return "NA";
  if (net > 0) return "PASS";
  if (net < 0) return "FAIL";
  return "NA";
}

async function main() {
  // 대형주 3 + 중소형주 후보. 시총 상위/하위에서 dartCode 있는 종목 선별.
  const big = await prisma.stock.findMany({
    where: { dartCode: { not: null } },
    orderBy: { rank: "asc" },
    take: 3,
    select: { id: true, name: true, dartCode: true, rank: true },
  });
  const small = await prisma.stock.findMany({
    where: { dartCode: { not: null }, rank: { gte: 200 } },
    orderBy: { rank: "desc" },
    take: 2,
    select: { id: true, name: true, dartCode: true, rank: true },
  });
  const samples = [...big, ...small];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  console.log(`6개월 컷오프: ${cutoffStr}  (BULK_GRANT_MIN_REPORTS=${BULK_GRANT_MIN_REPORTS})\n`);

  for (const s of samples) {
    let list;
    try { list = await fetchElestock(s.dartCode); }
    catch (e) { console.log(`[${s.id} ${s.name}] fetch 오류: ${e.message}\n`); continue; }
    if (!list || list.empty) {
      console.log(`[${s.id} ${s.name} rank=${s.rank}] elestock 데이터 없음\n`);
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    const oldA = aggregateOld(list, cutoffStr);
    const newA = aggregateNew(list, cutoffStr);

    console.log(`━━ [${s.id} ${s.name}] rank=${s.rank} ━━`);
    if (!oldA) { console.log("  6개월 내 유효 보고 없음 → NA\n"); await new Promise((r)=>setTimeout(r,400)); continue; }
    console.log(`  총 순매수      : ${oldA.net.toLocaleString()}주 (매수 ${oldA.buy} / 매도 ${oldA.sell})  판정[기존]=${verdictOld(oldA.net)}`);
    console.log(`  일괄부여 제외  : ${newA.bulkGrantCount}건 / ${newA.bulkGrantQty.toLocaleString()}주`);
    if (newA.bulkDates.length) {
      for (const b of newA.bulkDates) console.log(`      └ ${b.date}: 매수보고 ${b.count}건, 증가분 ${b.sum.toLocaleString()}주`);
    }
    console.log(`  자발적 순매수  : ${newA.voluntaryNet.toLocaleString()}주  판정[신규]=${verdict(newA.voluntaryNet)}`);
    const changed = verdictOld(oldA.net) !== verdict(newA.voluntaryNet);
    console.log(`  판정 변화      : ${changed ? "★ " + verdictOld(oldA.net) + " → " + verdict(newA.voluntaryNet) : "동일"}\n`);
    await new Promise((r) => setTimeout(r, 400));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
