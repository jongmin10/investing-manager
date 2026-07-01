// 관세청 품목별 수출입실적(GW) 수집의 순수 로직 — HS→품목군 매핑·XML 파싱·fetch.
// prisma/env 비의존(키는 인자로 주입) → 백필 스크립트와 cron 콜렉터가 공유(단일 매핑 소스).
//
// API 계약(0단계 실호출 확정, 2026-07-01):
//   GET https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList
//   params: serviceKey, strtYymm/endYymm(YYYYMM, 범위 1년 이내), hsSgn(HS 앞자리)
//   응답 XML(네임스페이스 없음): expDlr/impDlr(USD 원값)·hsCode(10자리)·year("YYYY.MM").
//   year="총계"는 기간 합계행 → 스킵(중복 방지). 페이지네이션 없음(1콜 전체).

export const EXPORT_ENDPOINT =
  "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList";

// 품목군 → 대표 HS4 (disjoint partition, 근사 — 스펙 §3.3). 수집 스크립트/콜렉터가 소유.
export const EXPORT_GROUPS: { code: string; name: string; hs4: string[] }[] = [
  { code: "SEMICON", name: "반도체", hs4: ["8541", "8542"] },
  { code: "AUTO", name: "자동차", hs4: ["8703"] },
  { code: "AUTO_PARTS", name: "자동차부품", hs4: ["8708"] },
  { code: "OIL_PROD", name: "석유제품", hs4: ["2710"] },
  { code: "PETROCHEM", name: "석유화학", hs4: ["2902", "3901", "3902", "3903", "3904"] },
  { code: "SHIP", name: "선박", hs4: ["8901", "8904", "8905"] },
  { code: "WIRELESS", name: "무선통신기기", hs4: ["8517"] },
  { code: "DISPLAY", name: "디스플레이", hs4: ["8524"] },
  { code: "STEEL", name: "철강", hs4: ["7208", "7210", "7219", "7225"] },
  { code: "COMPUTER", name: "컴퓨터", hs4: ["8471"] },
  { code: "MACHINE", name: "일반기계", hs4: ["8479"] },
  { code: "BIO", name: "바이오헬스", hs4: ["3002", "3004"] },
  { code: "BATTERY", name: "이차전지", hs4: ["8507"] },
  { code: "HOME_APPL", name: "가전", hs4: ["8418", "8450"] },
  { code: "TEXTILE", name: "섬유류", hs4: ["5407", "6104", "6109"] },
];

export interface TradeLine {
  ym: string; // "YYYY-MM"
  expDlr: bigint;
  impDlr: bigint;
}

function toBig(s: string): bigint {
  const n = s.trim().replace(/[^0-9-]/g, "");
  return n ? BigInt(n) : BigInt(0);
}

/** GW 응답 XML → 월별 라인(총계행·이상행 제외). */
export function parseTradeXml(xml: string): TradeLine[] {
  const out: TradeLine[] = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const year = block.match(/<year>([^<]*)</)?.[1] ?? "";
    if (year === "총계" || !/^\d{4}\.\d{2}$/.test(year)) continue;
    out.push({
      ym: year.replace(".", "-"),
      expDlr: toBig(block.match(/<expDlr>([^<]*)</)?.[1] ?? "0"),
      impDlr: toBig(block.match(/<impDlr>([^<]*)</)?.[1] ?? "0"),
    });
  }
  return out;
}

/** [fromYYYYMM, toYYYYMM] 을 ≤12개월(연 단위) 창으로 분할 (API 제약: 조회기간 1년 이내). */
export function yearWindows(from: string, to: string): { from: string; to: string }[] {
  const fy = +from.slice(0, 4), ty = +to.slice(0, 4);
  const wins: { from: string; to: string }[] = [];
  for (let y = fy; y <= ty; y++) {
    wins.push({ from: y === fy ? from : `${y}01`, to: y === ty ? to : `${y}12` });
  }
  return wins;
}

/** 한 HS4 의 [from,to] 실적 fetch+파싱. key 는 호출자가 주입(env 비의존). */
export async function fetchHs4(
  key: string,
  hs4: string,
  from: string,
  to: string
): Promise<TradeLine[]> {
  const url =
    `${EXPORT_ENDPOINT}?serviceKey=${encodeURIComponent(key)}` +
    `&strtYymm=${from}&endYymm=${to}&hsSgn=${hs4}`;
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HS ${hs4} HTTP ${res.status}`);
  const xml = await res.text();
  const rc = xml.match(/<resultCode>([^<]*)</)?.[1];
  if (rc && rc !== "00") {
    throw new Error(`HS ${hs4} resultCode=${rc} ${xml.match(/<resultMsg>([^<]*)</)?.[1] ?? ""}`);
  }
  return parseTradeXml(xml);
}

/** 품목군의 여러 HS4 · 여러 연창을 받아 (월)→{exp,imp} 로 합산. */
export async function collectGroup(
  key: string,
  hs4List: string[],
  from: string,
  to: string,
  delayMs = 250
): Promise<Map<string, { exp: bigint; imp: bigint }>> {
  const byMonth = new Map<string, { exp: bigint; imp: bigint }>();
  for (const hs4 of hs4List) {
    for (const w of yearWindows(from, to)) {
      const lines = await fetchHs4(key, hs4, w.from, w.to);
      for (const l of lines) {
        const cur = byMonth.get(l.ym) ?? { exp: BigInt(0), imp: BigInt(0) };
        cur.exp += l.expDlr;
        cur.imp += l.impDlr;
        byMonth.set(l.ym, cur);
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return byMonth;
}
