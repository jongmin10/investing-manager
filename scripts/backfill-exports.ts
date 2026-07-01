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
import { EXPORT_GROUPS, collectGroup } from "../src/lib/exports-hs";

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

async function main() {
  const key = readEnv("CUSTOMS_SERVICE_KEY");
  const argv = process.argv.slice(2);
  const from = (argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? "200001").replace("-", "");
  const to = (argv.find((a) => a.startsWith("--to="))?.split("=")[1] ?? ym(new Date())).replace("-", "");
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
