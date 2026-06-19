/**
 * DART 기업 코드 매핑 스크립트
 * 실행: node scripts/fetch-dart-corp-codes.mjs
 *
 * 사전 준비: .env 파일에 DART_API_KEY=발급받은키 설정
 * DART OpenAPI 키 발급: https://opendart.fss.or.kr/uat/uia/eqasIdScrn.do
 */

import { PrismaClient } from "@prisma/client";
import AdmZip from "adm-zip";
import { config } from "dotenv";

config(); // .env 로드

const DART_API_KEY = process.env.DART_API_KEY;
const prisma = new PrismaClient();

async function main() {
  if (!DART_API_KEY) {
    console.error("❌ DART_API_KEY가 설정되지 않았습니다.");
    console.error("   .env 파일에 DART_API_KEY=발급받은키 를 추가하세요.");
    console.error("   발급: https://opendart.fss.or.kr/uat/uia/eqasIdScrn.do");
    process.exit(1);
  }

  // ── DART 기업 코드 ZIP 다운로드 ──────────────────────────
  console.log("DART 기업 코드 목록 다운로드 중...");
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_API_KEY}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    console.error("❌ 다운로드 실패:", e.message);
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ HTTP ${res.status}: ${text.slice(0, 200)}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`다운로드 완료 (${(buffer.length / 1024).toFixed(0)} KB)`);

  // ── ZIP 압축 해제 → CORPCODE.xml 추출 ────────────────────
  let xml;
  try {
    const zip     = new AdmZip(buffer);
    const entry   = zip.getEntry("CORPCODE.xml");
    if (!entry) throw new Error("CORPCODE.xml not found in ZIP");
    xml = entry.getData().toString("utf8");
  } catch (e) {
    console.error("❌ ZIP 파싱 실패:", e.message);
    process.exit(1);
  }

  // ── XML 파싱 (단순 regex — CORPCODE.xml 구조는 단순) ────
  // 구조: <list><corp_code>…</corp_code><stock_code>…</stock_code>…</list>
  const corpMap = new Map(); // stockCode → corpCode
  for (const match of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const block      = match[1];
    const corpCode   = block.match(/<corp_code>(\d+)<\/corp_code>/)?.[1];
    const stockCode  = block.match(/<stock_code>\s*(\d+)\s*<\/stock_code>/)?.[1]?.trim();
    if (corpCode && stockCode) {
      corpMap.set(stockCode, corpCode);
    }
  }
  console.log(`총 ${corpMap.size}개 기업 코드 파싱 완료`);

  // ── DB 종목에 dartCode 업데이트 ──────────────────────────
  const stocks = await prisma.stock.findMany({ select: { id: true, name: true } });
  let updated  = 0;
  let notFound = 0;

  for (const stock of stocks) {
    const dartCode = corpMap.get(stock.id);
    if (dartCode) {
      await prisma.stock.update({ where: { id: stock.id }, data: { dartCode } });
      console.log(`  ✓ ${stock.name} (${stock.id}) → DART ${dartCode}`);
      updated++;
    } else {
      console.log(`  ✗ ${stock.name} (${stock.id}) → 매핑 없음`);
      notFound++;
    }
  }

  console.log(`\n완료 — 매핑 ${updated}개 / 미매핑 ${notFound}개`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
