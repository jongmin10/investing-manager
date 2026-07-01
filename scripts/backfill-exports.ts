/**
 * 품목별 수출(입) 실적 백필 — 관세청 품목별 수출입실적(GW) OpenAPI. 멱등.
 *
 * 수집 로직·HS 매핑·API 계약은 src/lib/exports-hs.ts 가 소유(cron 콜렉터와 공유).
 * 이 스크립트는 1회성 전체 이력 백필용: .env 키 로드 + 전체기간 연 청크 호출 + upsert.
 *
 * 실행:
 *   npx tsx scripts/backfill-exports.ts [--from=200001] [--to=202606] [--only=SEMICON,AUTO]
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { EXPORT_GROUPS, collectGroup, fetchMonthTotal } from "../src/lib/exports-hs";

const prisma = new PrismaClient();

function readEnv(name: string): string {
  const raw = readFileSync(".env", "utf8");
  const m = raw.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n]*)`, "m"));
  if (!m || !m[1]) throw new Error(`${name} 가 .env 에 없습니다.`);
  return m[1];
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextYm(yyyymm: string): string {
  let y = +yyyymm.slice(0, 4), m = +yyyymm.slice(4);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}${String(m).padStart(2, "0")}`;
}

async function main() {
  const key = readEnv("CUSTOMS_SERVICE_KEY");
  const argv = process.argv.slice(2);
  const from = (argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? "200001").replace("-", "");
  const to = (argv.find((a) => a.startsWith("--to="))?.split("=")[1] ?? ym(new Date())).replace("-", "");
  // --totals: 월 총수출(TOTAL) 만 백필(커버율용). hsSgn 생략 총계행 → 응답 ~2MB/월.
  if (argv.includes("--totals")) {
    console.log(`총수출(TOTAL) 백필: ${from} ~ ${to}\n`);
    let ok = 0;
    for (let ym = from; ym <= to; ym = nextYm(ym)) {
      try {
        const t = await fetchMonthTotal(key, ym);
        if (!t) { console.log(`  - ${ym} 총계 없음(미확정)`); continue; }
        const yearMonth = `${ym.slice(0, 4)}-${ym.slice(4)}`;
        await prisma.monthlyExport.upsert({
          where: { itemCode_yearMonth: { itemCode: "TOTAL", yearMonth } },
          create: { itemCode: "TOTAL", itemName: "총수출", yearMonth, exportUsd: t.exp, importUsd: t.imp, provisional: false, periodLabel: null },
          update: { exportUsd: t.exp, importUsd: t.imp },
        });
        ok++;
        if (ok % 12 === 0) console.log(`  ✓ ${yearMonth} 까지 ${ok}개월 (최근 총수출 $${(Number(t.exp) / 1e8).toFixed(0)}억)`);
      } catch (e) {
        console.error(`  ✗ ${ym} 실패:`, (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log(`\n완료. TOTAL ${ok}개월.`);
    return;
  }

  const onlyArg = argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const only = onlyArg ? onlyArg.split(",").map((s) => s.trim().toUpperCase()) : null;
  const targets = only ? EXPORT_GROUPS.filter((g) => only.includes(g.code)) : EXPORT_GROUPS;

  console.log(`품목별 수출 백필: ${from} ~ ${to}, ${targets.length}개 품목군\n`);
  const BATCH = 20;

  for (const g of targets) {
    try {
      const byMonth = await collectGroup(key, g.hs4, from, to, 250);
      const rows = [...byMonth.entries()]
        .filter(([, v]) => v.exp > BigInt(0) || v.imp > BigInt(0))
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
