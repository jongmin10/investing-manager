import AdmZip from "adm-zip";
import { prisma } from "./prisma";
import { loggedFetch } from "./logged-fetch";

// DART 기업 고유번호(corp_code) 매핑.
// 동적 유니버스로 신규 종목이 추가되면 dartCode가 비어 재무 수집이 불가하므로,
// 재무 수집 직전 누락 종목에 한해 자동 매핑한다.
//
// 재다운로드 방지: DART에 매핑이 없는 종목은 dartCode="" (센티넬)로 기록해
// 다음부터 "누락(null)"으로 잡히지 않게 한다. (빈 문자열은 falsy → 수집 시 건너뜀)

const CORP_CODE_URL = "https://opendart.fss.or.kr/api/corpCode.xml";

/**
 * dartCode가 null인 종목들을 DART corp_code에 매핑한다.
 * - 누락 종목이 없으면 다운로드하지 않고 즉시 반환
 * - DART_API_KEY가 없으면 건너뜀
 */
export async function mapMissingDartCodes(): Promise<{
  attempted: number; mapped: number; downloaded: boolean; error?: string;
}> {
  const missing = await prisma.stock.findMany({
    where: { dartCode: null }, select: { id: true },
  });
  if (missing.length === 0) return { attempted: 0, mapped: 0, downloaded: false };

  const key = process.env.DART_API_KEY;
  if (!key) return { attempted: missing.length, mapped: 0, downloaded: false, error: "DART_API_KEY 없음" };

  // corp_code 목록 ZIP 다운로드 → CORPCODE.xml 파싱
  let corpMap: Map<string, string>;
  try {
    const res = await loggedFetch(`${CORP_CODE_URL}?crtfc_key=${key}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { attempted: missing.length, mapped: 0, downloaded: false, error: `HTTP ${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    const entry  = new AdmZip(buffer).getEntry("CORPCODE.xml");
    if (!entry) return { attempted: missing.length, mapped: 0, downloaded: true, error: "CORPCODE.xml 없음" };
    const xml = entry.getData().toString("utf8");

    corpMap = new Map();
    for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
      const block     = m[1];
      const corpCode  = block.match(/<corp_code>(\d+)<\/corp_code>/)?.[1];
      const stockCode = block.match(/<stock_code>\s*(\d+)\s*<\/stock_code>/)?.[1]?.trim();
      if (corpCode && stockCode) corpMap.set(stockCode, corpCode);
    }
  } catch (e) {
    return { attempted: missing.length, mapped: 0, downloaded: false, error: String(e) };
  }

  // 누락 종목 갱신: 찾으면 corp_code, 못 찾으면 "" 센티넬 (재다운로드 방지)
  let mapped = 0;
  const BATCH = 20;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(
      missing.slice(i, i + BATCH).map((s) => {
        const code = corpMap.get(s.id);
        if (code) mapped++;
        return prisma.stock.update({ where: { id: s.id }, data: { dartCode: code ?? "" } });
      }),
    );
  }

  return { attempted: missing.length, mapped, downloaded: true };
}
