/**
 * 품목별 수출(입) 실적 백필 — 관세청 품목별 수출입실적(GW) OpenAPI. 멱등.
 *
 * 소스(0단계 실호출 확정, 2026-07-01):
 *   GET https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList
 *   params: serviceKey, strtYymm(YYYYMM), endYymm(YYYYMM), hsSgn(HS부호 앞자리)
 *   응답 XML(네임스페이스 없음) <item>: hsCode(10자리)·statKor·expDlr·impDlr·balPayments·
 *     expWgt·impWgt·year("YYYY.MM"). year="총계"는 기간 합계행 → 스킵.
 *   단위: expDlr/impDlr = USD 원값(달러). 페이지네이션 없음(1콜 전체), 범위조회 지원, 2000-01부터.
 *
 * 동작: 품목군별 대표 HS4 를 전체기간 1콜로 받아 (품목군, 월) 로 expDlr/impDlr 합산 → MonthlyExport
 *   upsert(provisional=false). HS→품목군 매핑은 이 스크립트가 소유(disjoint, "근사" — 스펙 §3.3).
 *
 * 실행: npx tsx scripts/backfill-exports.ts [--from=200001] [--to=202606]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ENDPOINT = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList";
const KEY = readEnv("CUSTOMS_SERVICE_KEY");

// 품목군 → 대표 HS4 (disjoint partition, 근사). 착수 검증(보도자료 교차)으로 정밀화 예정.
const GROUPS: { code: string; name: string; hs4: string[] }[] = [
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

function readEnv(name: string): string {
  const fs = require("fs") as typeof import("fs");
  const raw = fs.readFileSync(".env", "utf8");
  const m = raw.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n]*)`, "m"));
  if (!m || !m[1]) throw new Error(`${name} 가 .env 에 없습니다.`);
  return m[1];
}

const YF_HEADERS = { Accept: "application/xml, text/xml, */*" };

interface Line {
  ym: string; // "YYYY-MM"
  expDlr: bigint;
  impDlr: bigint;
}

// 한 HS4 의 전체기간 실적을 받아 월별 라인으로 파싱(총계행 제외).
async function fetchHs4(hs4: string, from: string, to: string): Promise<Line[]> {
  const url =
    `${ENDPOINT}?serviceKey=${encodeURIComponent(KEY)}` +
    `&strtYymm=${from}&endYymm=${to}&hsSgn=${hs4}`;
  const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HS ${hs4} HTTP ${res.status}`);
  const xml = await res.text();
  const rc = xml.match(/<resultCode>([^<]*)</)?.[1];
  if (rc && rc !== "00") throw new Error(`HS ${hs4} resultCode=${rc} ${xml.match(/<resultMsg>([^<]*)</)?.[1]}`);

  const out: Line[] = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const year = block.match(/<year>([^<]*)</)?.[1] ?? "";
    if (year === "총계" || !/^\d{4}\.\d{2}$/.test(year)) continue; // 합계행·이상행 스킵
    const ym = year.replace(".", "-");
    const exp = block.match(/<expDlr>([^<]*)</)?.[1] ?? "0";
    const imp = block.match(/<impDlr>([^<]*)</)?.[1] ?? "0";
    out.push({ ym, expDlr: toBig(exp), impDlr: toBig(imp) });
  }
  return out;
}

function toBig(s: string): bigint {
  const n = s.trim().replace(/[^0-9-]/g, "");
  return n ? BigInt(n) : 0n;
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// [fromYYYYMM, toYYYYMM] 을 ≤12개월(연 단위) 창으로 분할 (API 제약: 조회기간 1년 이내).
function yearWindows(from: string, to: string): { from: string; to: string }[] {
  const fy = +from.slice(0, 4), ty = +to.slice(0, 4);
  const wins: { from: string; to: string }[] = [];
  for (let y = fy; y <= ty; y++) {
    const wf = y === fy ? from : `${y}01`;
    const wt = y === ty ? to : `${y}12`;
    wins.push({ from: wf, to: wt });
  }
  return wins;
}

async function main() {
  const argv = process.argv.slice(2);
  const from = (argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? "200001").replace("-", "");
  const to = (argv.find((a) => a.startsWith("--to="))?.split("=")[1] ?? ym(new Date()).replace("-", "")).replace("-", "");

  const onlyArg = argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const only = onlyArg ? onlyArg.split(",").map((s) => s.trim().toUpperCase()) : null;
  const targets = only ? GROUPS.filter((g) => only.includes(g.code)) : GROUPS;

  console.log(`품목별 수출 백필: ${from} ~ ${to}, ${targets.length}개 품목군\n`);
  const BATCH = 20;

  for (const g of targets) {
    try {
      // 품목군의 HS4 들을 각각 받아 (월) 합산
      const byMonth = new Map<string, { exp: bigint; imp: bigint }>();
      for (const hs4 of g.hs4) {
        for (const w of yearWindows(from, to)) {
          const lines = await fetchHs4(hs4, w.from, w.to);
          for (const l of lines) {
            const cur = byMonth.get(l.ym) ?? { exp: 0n, imp: 0n };
            cur.exp += l.expDlr;
            cur.imp += l.impDlr;
            byMonth.set(l.ym, cur);
          }
          await new Promise((r) => setTimeout(r, 250)); // rate-limit 완화
        }
      }

      const rows = [...byMonth.entries()]
        .filter(([, v]) => v.exp > 0n || v.imp > 0n)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([yearMonth, v]) => ({
          itemCode: g.code,
          itemName: g.name,
          yearMonth,
          exportUsd: v.exp,
          importUsd: v.imp,
          provisional: false,
          periodLabel: null as string | null,
        }));

      for (let i = 0; i < rows.length; i += BATCH) {
        await Promise.all(
          rows.slice(i, i + BATCH).map((r) =>
            prisma.monthlyExport.upsert({
              where: { itemCode_yearMonth: { itemCode: r.itemCode, yearMonth: r.yearMonth } },
              create: r,
              update: { exportUsd: r.exportUsd, importUsd: r.importUsd, provisional: false, periodLabel: null },
            })
          )
        );
      }

      const first = rows[0], last = rows[rows.length - 1];
      console.log(
        `  ✓ ${g.name.padEnd(8)} ${rows.length}개월` +
          (last ? ` (${first.yearMonth}~${last.yearMonth}, 최근 수출 $${(Number(last.exportUsd) / 1e8).toFixed(1)}억)` : " (데이터 없음)")
      );
    } catch (e) {
      console.error(`  ✗ ${g.name} 실패:`, (e as Error).message);
    }
  }
  console.log("\n완료.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
