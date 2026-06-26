import { prisma } from "./prisma";
import { loggedFetch } from "./logged-fetch";

const EDGAR_SUB  = "https://data.sec.gov/submissions";
const EDGAR_ARC  = "https://www.sec.gov/Archives/edgar/data";
const FIGI_URL   = "https://api.openfigi.com/v3/mapping";

const EDGAR_HEADERS = {
  "User-Agent": "investing-manager/1.0 admin@example.com",
  "Accept-Encoding": "gzip, deflate",
  "Accept": "application/json, text/html, application/xml",
};

export const GURU_DEFS = [
  { id: "buffett",       name: "Warren Buffett",        fund: "Berkshire Hathaway",       cik: "0001067983", description: "오마하의 현인. 가치투자의 선구자",    xbrl: true  },
  { id: "ackman",        name: "Bill Ackman",           fund: "Pershing Square Capital",  cik: "0001336528", description: "집중 투자 행동주의 투자자",           xbrl: false },
  { id: "burry",         name: "Michael Burry",         fund: "Scion Asset Management",   cik: "0001649339", description: "빅숏의 주인공. 역발상 투자",         xbrl: false },
  { id: "dalio",         name: "Ray Dalio",             fund: "Bridgewater Associates",   cik: "0001350694", description: "올웨더 포트폴리오 창시자",           xbrl: false },
  { id: "tepper",        name: "David Tepper",          fund: "Appaloosa Management",     cik: "0001656456", description: "금융위기 수익률 1위 헤지펀드",       xbrl: false },
  { id: "druckenmiller", name: "Stanley Druckenmiller", fund: "Duquesne Family Office",   cik: "0001536411", description: "소로스의 수석 트레이더 출신",        xbrl: false },
  { id: "klarman",       name: "Seth Klarman",          fund: "Baupost Group",            cik: "0001061768", description: "안전마진 저자. 심층 가치투자",       xbrl: false },
  { id: "lilu",          name: "Li Lu",                 fund: "Himalaya Capital",         cik: "0001709323", description: "찰리 멍거가 인정한 투자자",          xbrl: false },
];

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
function padCik(cik: string) { return cik.replace(/^0*/, "").padStart(10, "0"); }
function reportDateToQuarter(date: string): string {
  const m = parseInt(date.slice(5, 7), 10);
  return `${date.slice(0, 4)}Q${Math.ceil(m / 3)}`;
}
function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&apos;/g, "'").replace(/&quot;/g, '"');
}

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

// ── EDGAR: 최근 N개 13F-HR 제출 정보 조회 (오래된 순) ────────
async function fetchRecent13Fs(cik: string, count = 2): Promise<{ accession: string; reportDate: string }[]> {
  const padded = padCik(cik);
  try {
    const res = await loggedFetch(`${EDGAR_SUB}/CIK${padded}.json`, {
      headers: EDGAR_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data: {
      filings: { recent: { form: string[]; reportDate: string[]; accessionNumber: string[] } };
    } = await res.json();

    const results: { accession: string; reportDate: string }[] = [];
    const forms = data.filings.recent.form;
    for (let i = 0; i < forms.length && results.length < count; i++) {
      if (forms[i] === "13F-HR") {
        results.push({
          accession:  data.filings.recent.accessionNumber[i],
          reportDate: data.filings.recent.reportDate[i],
        });
      }
    }
    return results.reverse(); // 오래된 것 먼저
  } catch { return []; }
}

// ── EDGAR: 인포테이블 XML URL 찾기 ──────────────────────────
async function findInfoTableUrl(cik: string, accession: string): Promise<string | null> {
  const cikNum    = cik.replace(/^0+/, "");
  const accFolder = accession.replace(/-/g, "");
  const indexUrl  = `${EDGAR_ARC}/${cikNum}/${accFolder}/${accession}-index.htm`;

  try {
    const res = await loggedFetch(indexUrl, { headers: EDGAR_HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const html = await res.text();

    function toAbsUrl(href: string): string {
      if (href.startsWith("http")) return href;
      if (href.startsWith("/")) return `https://www.sec.gov${href}`;
      return `${EDGAR_ARC}/${cikNum}/${accFolder}/${href}`;
    }

    const xmlLinks = [...html.matchAll(/href="([^"]+\.xml)"/gi)]
      .map((m) => m[1])
      .filter((p) => !p.includes("xslForm13F"));

    const chosen = xmlLinks.find(
      (p) => !p.toLowerCase().includes("primary_doc") && !p.toLowerCase().includes("cover")
    ) ?? xmlLinks[0];

    return chosen ? toAbsUrl(chosen) : null;
  } catch { return null; }
}

// ── EDGAR: 인포테이블 XML 파싱 ──────────────────────────────
interface RawHolding { company: string; cusip: string; value: number; shares: number; }

async function fetchHoldings(xmlUrl: string): Promise<RawHolding[]> {
  try {
    const res = await loggedFetch(xmlUrl, { headers: EDGAR_HEADERS, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return [];
    let xml = await res.text();

    // 네임스페이스 접두사 제거 (예: <ns1:infoTable> → <infoTable>)
    xml = xml.replace(/<(\/?)\w+:(\w)/g, "<$1$2");

    const holdings: RawHolding[] = [];
    const re = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const block   = m[1];
      const cusip   = xmlVal(block, "cusip");
      const value   = parseFloat(xmlVal(block, "value") || "0");
      const shares  = parseFloat(xmlVal(block, "sshPrnamt") || "0");
      const company = xmlVal(block, "nameOfIssuer");
      if (cusip && value > 0) holdings.push({ company, cusip, value, shares });
    }
    return holdings;
  } catch { return []; }
}

// ── OpenFIGI: CUSIP → 티커 매핑 ─────────────────────────────
async function mapCusips(cusips: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  // OpenFIGI 무료 플랜: 최대 10개/요청, 25요청/분
  for (let i = 0; i < cusips.length; i += 10) {
    const batch = cusips.slice(i, i + 10);
    try {
      const res = await loggedFetch(FIGI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch.map((c) => ({ idType: "ID_CUSIP", idValue: c }))),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data: { data?: { ticker?: string; exchCode?: string }[] }[] = await res.json();
        for (let j = 0; j < batch.length; j++) {
          const entries = data[j]?.data ?? [];
          const best = entries.find((e) => e.exchCode === "US") ?? entries[0];
          if (best?.ticker) result.set(batch[j], best.ticker);
        }
      }
    } catch { /* 티커 없이 진행 */ }
    await sleep(2_500); // 25req/min 제한 준수
  }
  return result;
}

// ── EDGAR XBRL: 총자산·현금 수집 ────────────────────────────
type XbrlEntry = { end: string; val: number; form: string; fp: string };

async function fetchXbrlAssets(cik: string): Promise<{
  totalAssetsM: number; cashM: number; assetsQuarter: string;
} | null> {
  const padded = padCik(cik);
  try {
    const res = await loggedFetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`,
      { headers: EDGAR_HEADERS, signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return null;

    const data: { facts: { "us-gaap": Record<string, { units: { USD: XbrlEntry[] } }> } } = await res.json();
    const usgaap = data.facts["us-gaap"];

    function latestQuarterly(key: string): XbrlEntry | null {
      const entries = (usgaap[key]?.units?.USD ?? [])
        .filter((e) => e.form === "10-Q" || e.form === "10-K")
        .sort((a, b) => b.end.localeCompare(a.end));
      return entries[0] ?? null;
    }

    const assets    = latestQuarterly("Assets");
    const cash      = latestQuarterly("CashAndCashEquivalentsAtCarryingValue");
    const shortTerm = latestQuarterly("ShortTermInvestments");

    if (!assets) return null;

    const cashVal = (cash?.val ?? 0) + (shortTerm?.val ?? 0);
    const quarter = reportDateToQuarter(assets.end);

    return {
      totalAssetsM:  Math.round(assets.val / 1_000_000),
      cashM:         Math.round(cashVal / 1_000_000),
      assetsQuarter: quarter,
    };
  } catch { return null; }
}

// ── 단일 분기 데이터를 DB에 저장 ─────────────────────────────
async function saveQuarter(
  guruId: string,
  quarter: string,
  rawHoldings: RawHolding[],
  tickerMap: Map<string, string>,
  prevMap: Map<string, { shares: number; company: string; ticker: string | null }>,
) {
  const totalValue = rawHoldings.reduce((s, h) => s + h.value, 0);

  // 보유 종목 행 생성
  const rows = rawHoldings.map((h) => {
    const prev = prevMap.get(h.cusip);
    let changeType = "unchanged";
    let changePct: number | null = null;
    if (!prev) {
      changeType = "new";
    } else if (h.shares > prev.shares * 1.001) {
      changeType = "added";
      changePct  = parseFloat(((h.shares - prev.shares) / prev.shares * 100).toFixed(1));
    } else if (h.shares < prev.shares * 0.999) {
      changeType = "reduced";
      changePct  = parseFloat(((h.shares - prev.shares) / prev.shares * 100).toFixed(1));
    }
    return {
      guruId, quarter, cusip: h.cusip,
      ticker: tickerMap.get(h.cusip) ?? null, company: h.company,
      shares: h.shares, value: h.value,
      portfolioPct: totalValue > 0 ? parseFloat((h.value / totalValue * 100).toFixed(2)) : null,
      changeType, changePct,
    };
  });

  // 전량 매도 종목 행 추가
  const currentCusips = new Set(rawHoldings.map((h) => h.cusip));
  const soldRows = [...prevMap.entries()]
    .filter(([cusip]) => !currentCusips.has(cusip))
    .map(([cusip, prev]) => ({
      guruId, quarter, cusip,
      ticker: prev.ticker, company: prev.company,
      shares: 0, value: 0, portfolioPct: 0,
      changeType: "sold", changePct: -100,
    }));

  // SQLite 동시성 한계 → 20개씩 배치 upsert
  const allRows = [...rows, ...soldRows];
  const BATCH = 20;
  for (let i = 0; i < allRows.length; i += BATCH) {
    await Promise.all(
      allRows.slice(i, i + BATCH).map((row) =>
        prisma.guruHolding.upsert({
          where:  { guruId_quarter_cusip: { guruId, quarter, cusip: row.cusip } },
          create: row, update: row,
        })
      )
    );
  }

  return allRows.length;
}

// ── 단일 분기 수집 헬퍼 ─────────────────────────────────────
async function collectOneFiling(
  guruId: string,
  cik: string,
  accession: string,
  reportDate: string,
  prevMap: Map<string, { shares: number; company: string; ticker: string | null }>,
): Promise<{ count: number; quarter: string } | null> {
  const quarter = reportDateToQuarter(reportDate);

  const existing = await prisma.guruHolding.count({ where: { guruId, quarter } });
  if (existing > 0) {
    // 이미 있지만 변동 미계산(prevMap 없었을 때) → 재계산
    const hasChange = await prisma.guruHolding.count({ where: { guruId, quarter, changeType: { not: "new" } } });
    if (prevMap.size === 0 || hasChange > 0) return { count: existing, quarter };
  }

  const xmlUrl = await findInfoTableUrl(cik, accession);
  if (!xmlUrl) return null;
  await sleep(400);

  const rawHoldings = await fetchHoldings(xmlUrl);
  if (rawHoldings.length === 0) return null;
  await sleep(300);

  const cusips    = [...new Set(rawHoldings.map((h) => h.cusip))];
  const tickerMap = await mapCusips(cusips);
  await sleep(400);

  const count = await saveQuarter(guruId, quarter, rawHoldings, tickerMap, prevMap);
  return { count, quarter };
}

// ── 단일 대가 수집 (최근 2개 분기) ──────────────────────────
export async function collectGuru(guruId: string): Promise<{
  ok: boolean; quarter?: string; count?: number;
  prevQuarter?: string; error?: string;
}> {
  const def = GURU_DEFS.find((g) => g.id === guruId);
  if (!def) return { ok: false, error: "not found" };

  await prisma.guru.upsert({
    where:  { id: def.id },
    create: { id: def.id, name: def.name, fund: def.fund, cik: def.cik, description: def.description },
    update: { name: def.name, fund: def.fund, description: def.description },
  });
  await sleep(300);

  const filings = await fetchRecent13Fs(def.cik, 2);
  if (filings.length === 0) return { ok: false, error: "13F 없음" };
  await sleep(300);

  // 1. 이전 분기 수집 (filings[0])
  let prevMap = new Map<string, { shares: number; company: string; ticker: string | null }>();
  let prevQuarter: string | undefined;

  if (filings.length >= 2) {
    const prev = filings[0];
    prevQuarter = reportDateToQuarter(prev.reportDate);
    const prevResult = await collectOneFiling(def.id, def.cik, prev.accession, prev.reportDate, new Map());
    if (prevResult) {
      await sleep(600);
      // 이전 분기 데이터를 prevMap으로 로드
      const prevRows = await prisma.guruHolding.findMany({
        where: { guruId: def.id, quarter: prevQuarter, changeType: { not: "sold" } },
        select: { cusip: true, shares: true, company: true, ticker: true },
      });
      prevRows.forEach((r) => prevMap.set(r.cusip, { shares: r.shares, company: r.company, ticker: r.ticker }));
    }
  }

  // 2. 현재 분기 수집 (filings[filings.length - 1])
  const latest = filings[filings.length - 1];
  const currentResult = await collectOneFiling(def.id, def.cik, latest.accession, latest.reportDate, prevMap);
  if (!currentResult) return { ok: false, error: "수집 실패" };

  // XBRL 총자산 수집 (공개 상장사만)
  if (def.xbrl) {
    await sleep(400);
    const xbrl = await fetchXbrlAssets(def.cik);
    if (xbrl) {
      await prisma.guru.update({
        where: { id: def.id },
        data:  { totalAssetsM: xbrl.totalAssetsM, cashM: xbrl.cashM, assetsQuarter: xbrl.assetsQuarter, updatedAt: new Date() },
      });
    } else {
      await prisma.guru.update({ where: { id: def.id }, data: { updatedAt: new Date() } });
    }
  } else {
    await prisma.guru.update({ where: { id: def.id }, data: { updatedAt: new Date() } });
  }

  return { ok: true, quarter: currentResult.quarter, count: currentResult.count, prevQuarter };
}

// ── 전체 대가 수집 ───────────────────────────────────────────
export async function collectAllGurus() {
  const results = [];
  for (const def of GURU_DEFS) {
    const res = await collectGuru(def.id);
    results.push({ id: def.id, name: def.name, ...res });
    await sleep(1_200);
  }
  return results;
}

// ── 변동 집계 조회 ───────────────────────────────────────────
export async function getChangeSummary(guruId: string, quarter: string) {
  const stats = await prisma.guruHolding.groupBy({
    by: ["changeType"],
    where: { guruId, quarter },
    _count: { changeType: true },
  });
  const summary = { new: 0, added: 0, reduced: 0, sold: 0, unchanged: 0 };
  for (const s of stats) {
    const key = (s.changeType ?? "unchanged") as keyof typeof summary;
    if (key in summary) summary[key] = s._count.changeType;
  }
  return summary;
}
