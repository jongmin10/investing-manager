import { prisma } from "@/lib/prisma";

// ─── EDGAR Capex (하이퍼스케일러 4사) ────────────────────────────────────────

// xbrlTags: 회사별 XBRL 태그 우선순위 리스트 (첫 번째 태그에 최근 90일 데이터가 없으면 다음 시도)
const HYPERSCALERS = [
  {
    cik: "0000789019",
    metric: "CAPEX_MSFT",
    name: "Microsoft",
    xbrlTags: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  },
  {
    cik: "0001018724",
    metric: "CAPEX_AMZN",
    name: "Amazon",
    // Amazon은 2018년 이후 PaymentsToAcquireProductiveAssets 로 전환
    xbrlTags: [
      "PaymentsToAcquireProductiveAssets",
      "PaymentsToAcquirePropertyPlantAndEquipment",
    ],
  },
  {
    cik: "0001652044",
    metric: "CAPEX_GOOG",
    name: "Alphabet",
    xbrlTags: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  },
  {
    cik: "0001326801",
    metric: "CAPEX_META",
    name: "Meta",
    xbrlTags: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  },
] as const;

const EDGAR_UA = "investing-manager/1.0 admin@example.com";

// ISO date 끝일 → 캘린더 분기 "YYYYQn"
function toCalendarQuarter(endDate: string): string {
  const d = new Date(endDate);
  const q = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `${d.getUTCFullYear()}Q${q}`;
}

interface XbrlEntry {
  start?: string;
  end: string;
  val: number;
  form: string;
  filed?: string;
}

// 2년 이내 최신 90일 데이터가 있으면 "최신" 태그로 판정
function isRecentQuarterly(entries: XbrlEntry[]): boolean {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  return entries.some((e) => {
    if (!e.start) return false;
    const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86_400_000;
    return days >= 80 && days <= 100 && new Date(e.end) >= cutoff;
  });
}

// Google/Meta 처럼 10-Q에 YTD 누적만 보고하는 회사를 처리:
// - Q1(80~100일)은 직접 사용
// - Q2 YTD(160~200일) - Q1 = Q2 실제
// - Q3 YTD(250~285일) - Q2 YTD = Q3 실제
// MSFT/AMZN처럼 개별 분기를 직접 보고하는 회사도 동일 로직으로 처리됨.
function extractQuarterlyValues(entries: XbrlEntry[]): Map<string, number> {
  // 10-Q, start/end 모두 있는 항목만
  const all10Q = entries
    .filter((e) => e.form === "10-Q" && e.start && e.end)
    .map((e) => ({
      start: e.start!,
      end: e.end,
      val: e.val,
      filed: e.filed ?? "",
      days:
        (new Date(e.end).getTime() - new Date(e.start!).getTime()) / 86_400_000,
    }));

  // 동일 (start, end) 쌍이 여러 filing에 중복 존재 → 최신 filed 우선
  const dedupMap = new Map<string, (typeof all10Q)[0]>();
  for (const e of all10Q) {
    const key = `${e.start}|${e.end}`;
    const existing = dedupMap.get(key);
    if (!existing || e.filed > existing.filed) dedupMap.set(key, e);
  }

  // 회계연도 시작일(start)별로 그룹핑 → 같은 FY 내에서 YTD 차분 계산
  const byFyStart = new Map<string, (typeof all10Q)>();
  for (const e of dedupMap.values()) {
    const list = byFyStart.get(e.start) ?? [];
    list.push(e);
    byFyStart.set(e.start, list);
  }

  const computed = new Map<string, number>(); // period → USD (raw, not divided by 1B)

  for (const fyEntries of byFyStart.values()) {
    fyEntries.sort((a, b) => a.end.localeCompare(b.end));

    const q1    = fyEntries.find((e) => e.days >= 80 && e.days <= 100);
    const q2ytd = fyEntries.find((e) => e.days >= 160 && e.days <= 200);
    const q3ytd = fyEntries.find((e) => e.days >= 250 && e.days <= 285);

    if (q1) {
      computed.set(toCalendarQuarter(q1.end), q1.val);
    }
    if (q2ytd && q1) {
      // Q2 실제 = Q2 YTD - Q1
      computed.set(toCalendarQuarter(q2ytd.end), q2ytd.val - q1.val);
    }
    if (q3ytd && q2ytd) {
      // Q3 실제 = Q3 YTD - Q2 YTD
      computed.set(toCalendarQuarter(q3ytd.end), q3ytd.val - q2ytd.val);
    }
  }

  return computed;
}

async function fetchCapexForCompany(
  def: (typeof HYPERSCALERS)[number],
): Promise<number> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${def.cik}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": EDGAR_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as {
    facts?: {
      "us-gaap"?: Record<string, { units?: { USD?: XbrlEntry[] } }>;
    };
  };

  // 회사별 태그 우선순위 — 최신 90일 데이터가 있는 첫 번째 태그 사용
  let entries: XbrlEntry[] = [];
  for (const tag of def.xbrlTags) {
    const candidates = data.facts?.["us-gaap"]?.[tag]?.units?.USD ?? [];
    if (isRecentQuarterly(candidates)) {
      entries = candidates;
      break;
    }
    if (entries.length === 0) entries = candidates;
  }

  // YTD 차분을 포함한 분기 값 추출
  const quarterlyMap = extractQuarterlyValues(entries);

  // 최근 8분기만 저장
  const recentPeriods = [...quarterlyMap.keys()].sort().slice(-8);

  let upserted = 0;
  for (const period of recentPeriods) {
    const valueB = quarterlyMap.get(period)! / 1_000_000_000;
    await prisma.dataCenterRecord.upsert({
      where: {
        metric_country_period: {
          metric: def.metric,
          country: "US",
          period,
        },
      },
      create: {
        source: "EDGAR",
        metric: def.metric,
        country: "US",
        period,
        value: valueB,
        unit: "USD_B",
      },
      update: { value: valueB, collectedAt: new Date() },
    });
    upserted++;
  }
  return upserted;
}

export async function collectEDGARCapex(): Promise<{
  ok: number;
  failed: string[];
}> {
  const result = { ok: 0, failed: [] as string[] };
  for (const def of HYPERSCALERS) {
    try {
      result.ok += await fetchCapexForCompany(def);
    } catch (e) {
      result.failed.push(`${def.name}: ${(e as Error).message}`);
    }
    // EDGAR 비공식 가이드라인: 요청 사이 간격 두기
    await new Promise((r) => setTimeout(r, 600));
  }
  return result;
}

// ─── EIA 전력 수요 (버지니아 주) ─────────────────────────────────────────────

export async function collectEIAPower(): Promise<{
  ok: number;
  failed: string[];
}> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) return { ok: 0, failed: ["EIA_API_KEY 미설정"] };

  // URLSearchParams 가 대괄호를 %5B%5D 로 인코딩해 EIA API 가 인식 못함 →
  // 브라켓을 포함한 쿼리스트링을 직접 조립한다.
  const qs = [
    `api_key=${encodeURIComponent(apiKey)}`,
    "frequency=monthly",
    "data[]=sales",
    "facets[stateid][]=VA",
    "facets[sectorid][]=ALL", // 전체 부문 합산 (ALL = sectorName "all sectors")
    "sort[0][column]=period",
    "sort[0][direction]=desc",
    "length=36",
  ].join("&");

  try {
    const res = await fetch(
      `https://api.eia.gov/v2/electricity/retail-sales/data/?${qs}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`EIA HTTP ${res.status}`);

    const json = (await res.json()) as {
      response?: { data?: { period: string; sales: string | number }[] };
    };

    const rows = json.response?.data ?? [];
    let ok = 0;
    for (const row of rows) {
      if (!row.period) continue;
      const salesMwh = Number(row.sales);
      if (isNaN(salesMwh) || salesMwh <= 0) continue;
      // EIA retail-sales API: 단위 = 백만 kWh(= GWh)
      const gwh = salesMwh;

      await prisma.dataCenterRecord.upsert({
        where: {
          metric_country_period: {
            metric: "POWER_VA",
            country: "US",
            period: row.period,
          },
        },
        create: {
          source: "EIA",
          metric: "POWER_VA",
          country: "US",
          period: row.period,
          value: gwh,
          unit: "GWh",
        },
        update: { value: gwh, collectedAt: new Date() },
      });
      ok++;
    }
    return { ok, failed: [] };
  } catch (e) {
    return { ok: 0, failed: [(e as Error).message] };
  }
}

// ─── baxtel.com 스크래핑 (12개국 DC 카운트) ─────────────────────────────────
// datacentermap.com 은 Cloudflare로 차단(429). baxtel.com 은 SSR HTML 직접 접근 가능.
// 파싱 패턴: "Explore 4969 data centers in United States."

const BAXTEL_COUNTRIES = [
  { code: "US", slug: "united-states" },
  { code: "DE", slug: "germany-deutschland" },
  { code: "GB", slug: "united-kingdom" },
  { code: "NL", slug: "netherlands" },
  { code: "FR", slug: "france" },
  { code: "JP", slug: "japan" },
  { code: "SG", slug: "singapore" },
  { code: "AU", slug: "australia" },
  { code: "CN", slug: "china" },
  { code: "KR", slug: "south-korea" },
  { code: "CA", slug: "canada" },
  { code: "IN", slug: "india-bharata" },
] as const;

const BAXTEL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function parseBaxtelCount(html: string): number | null {
  // <meta> description: "Explore 4,969 data centers in United States."
  const m = html.match(/Explore\s+([\d,]+)\s+data\s+cent/i);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (n > 0) return n;
  }
  return null;
}

export async function collectDCMapCounts(): Promise<{
  ok: number;
  failed: string[];
}> {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  let ok = 0;
  const failed: string[] = [];

  for (const country of BAXTEL_COUNTRIES) {
    try {
      const url = `https://baxtel.com/data-center/${country.slug}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": BAXTEL_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const count = parseBaxtelCount(html);
      if (count === null) throw new Error("카운트 파싱 실패");

      await prisma.dataCenterRecord.upsert({
        where: {
          metric_country_period: {
            metric: "DC_COUNT",
            country: country.code,
            period,
          },
        },
        create: {
          source: "BAXTEL",
          metric: "DC_COUNT",
          country: country.code,
          period,
          value: count,
          unit: "개",
        },
        update: { value: count, collectedAt: new Date() },
      });
      ok++;
    } catch (e) {
      failed.push(`${country.code}: ${(e as Error).message}`);
    }
    // baxtel 비공식 접근 — 요청 간격 1초
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return { ok, failed };
}
