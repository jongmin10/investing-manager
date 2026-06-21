import { prisma } from "./prisma";
import { mapMissingDartCodes } from "./dart-corp";

// 네이버 금융 시가총액 순위 페이지를 스크랩해 시총 상위 N개 유니버스를 동적 구성한다.
// 순위가 바뀌어도 수집 직전 자동 갱신되어 항상 최신 top-N을 추적한다.

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://finance.naver.com/",
};

// ETF/ETN 브랜드 접두사 (실제 기업명에는 쓰이지 않는 식별자)
const ETF_BRANDS = [
  "KODEX", "TIGER", "KBSTAR", "ARIRANG", "ACE", "SOL", "PLUS", "RISE",
  "HANARO", "KOSEF", "KIWOOM", "WOORI", "TIMEFOLIO", "FOCUS", "BNK",
  "VITA", "TREX", "KCGI", "SMART", "HK", "마이다스", "에셋플러스", "파워",
  "히어로즈", "마이티",
];

function isExcluded(name: string): boolean {
  // 우선주
  if (/우$|[0-9]우[BC]?$|우[BC]$/.test(name)) return true;
  // 스팩(기업인수목적)
  if (/스팩|기업인수목적/.test(name)) return true;
  // ETF/ETN 브랜드
  if (ETF_BRANDS.some((b) => name.startsWith(b))) return true;
  // ETF 인덱스/파생 키워드
  if (/레버리지|인버스|선물|커버드콜| TR$|[0-9]TR$|채권액티브|국고채/.test(name)) return true;
  return false;
}

interface ScrapedStock { code: string; name: string; market: "KOSPI" | "KOSDAQ"; marketCap: number; }

async function fetchMarketSumPage(sosok: "0" | "1", page: number): Promise<ScrapedStock[]> {
  const market = sosok === "0" ? "KOSPI" : "KOSDAQ";
  const res = await fetch(
    `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`,
    { headers: NAVER_HEADERS, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) return [];
  const buf  = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf); // 시총 페이지는 EUC-KR

  const rows: ScrapedStock[] = [];
  const re = /<a href="\/item\/main\.naver\?code=(\d{6})"[^>]*class="tltle">([^<]+)<\/a>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const code = m[1];
    const name = m[2].trim();
    // td.number 순서: 현재가, 액면가, 시가총액, 상장주식수, ...
    const nums = [...m[3].matchAll(/<td class="number">([\d,.\-]+)<\/td>/g)].map((x) => x[1]);
    const marketCap = nums[2] ? parseInt(nums[2].replace(/,/g, ""), 10) : 0;
    if (marketCap > 0) rows.push({ code, name, market, marketCap });
  }
  return rows;
}

/**
 * 시총 상위 limit개 종목을 스크랩해 Stock 테이블에 반영한다.
 * - top-N 종목: marketCap·rank 기록 + 신규는 생성
 * - top-N 밖 기존 종목: marketCap·rank null 처리 (수집 대상에서 제외)
 */
export async function refreshStockUniverse(limit = 200): Promise<{
  ok: boolean; total: number; created: number; kospi: number; kosdaq: number;
  dartMapped?: number; error?: string;
}> {
  try {
    const PAGES = Math.ceil(limit / 50) + 2; // 페이지당 50행, 여유분 포함
    const scraped: ScrapedStock[] = [];
    for (const sosok of ["0", "1"] as const) {
      for (let p = 1; p <= PAGES; p++) {
        const rows = await fetchMarketSumPage(sosok, p);
        if (rows.length === 0) break;
        scraped.push(...rows);
      }
    }

    // 중복·제외 필터 후 시총 내림차순 정렬
    const seen = new Set<string>();
    const clean = scraped.filter((s) =>
      !isExcluded(s.name) && !seen.has(s.code) && seen.add(s.code),
    );
    clean.sort((a, b) => b.marketCap - a.marketCap);
    const top = clean.slice(0, limit);

    if (top.length === 0) return { ok: false, total: 0, created: 0, kospi: 0, kosdaq: 0, error: "스크랩 결과 없음" };

    // 신규 종목 카운트용 (sector는 가격 수집 시 네이버 페이지에서 함께 갱신됨)
    const existingIds = new Set(
      (await prisma.stock.findMany({ select: { id: true } })).map((s) => s.id),
    );

    // 기존 유니버스 멤버십 초기화 (이번에 빠진 종목은 수집 대상에서 제외됨)
    await prisma.stock.updateMany({ data: { marketCap: null, rank: null } });

    let created = 0;
    const BATCH = 20;
    for (let i = 0; i < top.length; i += BATCH) {
      await Promise.all(
        top.slice(i, i + BATCH).map((s, k) => {
          const rank = i + k + 1;
          const yahooSymbol = `${s.code}.${s.market === "KOSPI" ? "KS" : "KQ"}`;
          if (!existingIds.has(s.code)) created++;
          return prisma.stock.upsert({
            where:  { id: s.code },
            // 기존 sector·dartCode는 유지하고 이름/시장/시총/순위만 갱신
            create: { id: s.code, name: s.name, market: s.market, yahooSymbol, marketCap: s.marketCap, rank },
            update: { name: s.name, market: s.market, yahooSymbol, marketCap: s.marketCap, rank },
          });
        }),
      );
    }

    // 신규 종목의 DART corp_code 자동 매핑 (누락 종목 없으면 다운로드 생략)
    const dart = await mapMissingDartCodes();

    return {
      ok: true,
      total:  top.length,
      created,
      kospi:  top.filter((s) => s.market === "KOSPI").length,
      kosdaq: top.filter((s) => s.market === "KOSDAQ").length,
      dartMapped: dart.mapped,
    };
  } catch (e) {
    return { ok: false, total: 0, created: 0, kospi: 0, kosdaq: 0, error: String(e) };
  }
}
