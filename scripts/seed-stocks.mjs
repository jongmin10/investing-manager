/**
 * 종목 마스터 시드 스크립트
 * 실행: node scripts/seed-stocks.mjs
 *
 * 시가총액 상위 KOSPI 70개 + KOSDAQ 30개 (총 100개)
 * Yahoo Finance 심볼: 코스피 .KS / 코스닥 .KQ
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STOCKS = [
  // ── KOSPI ──────────────────────────────────────────────
  { id: "005930", name: "삼성전자",        market: "KOSPI",  sector: "반도체",       yahooSymbol: "005930.KS" },
  { id: "000660", name: "SK하이닉스",      market: "KOSPI",  sector: "반도체",       yahooSymbol: "000660.KS" },
  { id: "373220", name: "LG에너지솔루션",  market: "KOSPI",  sector: "2차전지",      yahooSymbol: "373220.KS" },
  { id: "207940", name: "삼성바이오로직스", market: "KOSPI", sector: "바이오",       yahooSymbol: "207940.KS" },
  { id: "005380", name: "현대차",          market: "KOSPI",  sector: "자동차",       yahooSymbol: "005380.KS" },
  { id: "000270", name: "기아",            market: "KOSPI",  sector: "자동차",       yahooSymbol: "000270.KS" },
  { id: "005490", name: "POSCO홀딩스",     market: "KOSPI",  sector: "철강",         yahooSymbol: "005490.KS" },
  { id: "068270", name: "셀트리온",        market: "KOSPI",  sector: "바이오",       yahooSymbol: "068270.KS" },
  { id: "105560", name: "KB금융",          market: "KOSPI",  sector: "금융",         yahooSymbol: "105560.KS" },
  { id: "055550", name: "신한지주",        market: "KOSPI",  sector: "금융",         yahooSymbol: "055550.KS" },
  { id: "028260", name: "삼성물산",        market: "KOSPI",  sector: "지주/건설",    yahooSymbol: "028260.KS" },
  { id: "051910", name: "LG화학",          market: "KOSPI",  sector: "화학",         yahooSymbol: "051910.KS" },
  { id: "012330", name: "현대모비스",      market: "KOSPI",  sector: "자동차부품",   yahooSymbol: "012330.KS" },
  { id: "006400", name: "삼성SDI",         market: "KOSPI",  sector: "2차전지",      yahooSymbol: "006400.KS" },
  { id: "066570", name: "LG전자",          market: "KOSPI",  sector: "전자",         yahooSymbol: "066570.KS" },
  { id: "035420", name: "NAVER",           market: "KOSPI",  sector: "IT/인터넷",    yahooSymbol: "035420.KS" },
  { id: "035720", name: "카카오",          market: "KOSPI",  sector: "IT/인터넷",    yahooSymbol: "035720.KS" },
  { id: "017670", name: "SK텔레콤",        market: "KOSPI",  sector: "통신",         yahooSymbol: "017670.KS" },
  { id: "096770", name: "SK이노베이션",    market: "KOSPI",  sector: "에너지",       yahooSymbol: "096770.KS" },
  { id: "086790", name: "하나금융지주",    market: "KOSPI",  sector: "금융",         yahooSymbol: "086790.KS" },
  { id: "316140", name: "우리금융지주",    market: "KOSPI",  sector: "금융",         yahooSymbol: "316140.KS" },
  { id: "032830", name: "삼성생명",        market: "KOSPI",  sector: "보험",         yahooSymbol: "032830.KS" },
  { id: "034730", name: "SK",              market: "KOSPI",  sector: "지주",         yahooSymbol: "034730.KS" },
  { id: "015760", name: "한국전력",        market: "KOSPI",  sector: "전력",         yahooSymbol: "015760.KS" },
  { id: "009150", name: "삼성전기",        market: "KOSPI",  sector: "전자부품",     yahooSymbol: "009150.KS" },
  { id: "033780", name: "KT&G",            market: "KOSPI",  sector: "담배/소비재",  yahooSymbol: "033780.KS" },
  { id: "011170", name: "롯데케미칼",      market: "KOSPI",  sector: "화학",         yahooSymbol: "011170.KS" },
  { id: "010950", name: "S-Oil",           market: "KOSPI",  sector: "에너지",       yahooSymbol: "010950.KS" },
  { id: "000720", name: "현대건설",        market: "KOSPI",  sector: "건설",         yahooSymbol: "000720.KS" },
  { id: "003550", name: "LG",              market: "KOSPI",  sector: "지주",         yahooSymbol: "003550.KS" },
  { id: "097950", name: "CJ제일제당",      market: "KOSPI",  sector: "식품",         yahooSymbol: "097950.KS" },
  { id: "047050", name: "포스코인터내셔널", market: "KOSPI", sector: "무역",         yahooSymbol: "047050.KS" },
  { id: "259960", name: "크래프톤",        market: "KOSPI",  sector: "게임",         yahooSymbol: "259960.KS" },
  { id: "034020", name: "두산에너빌리티",  market: "KOSPI",  sector: "중공업",       yahooSymbol: "034020.KS" },
  { id: "267250", name: "HD현대",          market: "KOSPI",  sector: "지주",         yahooSymbol: "267250.KS" },
  { id: "012450", name: "한화에어로스페이스", market: "KOSPI", sector: "방산",       yahooSymbol: "012450.KS" },
  { id: "010140", name: "삼성중공업",      market: "KOSPI",  sector: "조선",         yahooSymbol: "010140.KS" },
  { id: "078930", name: "GS",              market: "KOSPI",  sector: "지주/에너지",  yahooSymbol: "078930.KS" },
  { id: "128940", name: "한미약품",        market: "KOSPI",  sector: "제약",         yahooSymbol: "128940.KS" },
  { id: "000100", name: "유한양행",        market: "KOSPI",  sector: "제약",         yahooSymbol: "000100.KS" },
  { id: "003670", name: "포스코퓨처엠",    market: "KOSPI",  sector: "2차전지소재",  yahooSymbol: "003670.KS" },
  { id: "042660", name: "한화오션",        market: "KOSPI",  sector: "조선",         yahooSymbol: "042660.KS" },
  { id: "009540", name: "HD한국조선해양",  market: "KOSPI",  sector: "조선",         yahooSymbol: "009540.KS" },
  { id: "086280", name: "현대글로비스",    market: "KOSPI",  sector: "물류",         yahooSymbol: "086280.KS" },
  { id: "000810", name: "삼성화재",        market: "KOSPI",  sector: "보험",         yahooSymbol: "000810.KS" },
  { id: "011780", name: "금호석유화학",    market: "KOSPI",  sector: "화학",         yahooSymbol: "011780.KS" },
  { id: "323410", name: "카카오뱅크",      market: "KOSPI",  sector: "금융",         yahooSymbol: "323410.KS" },
  { id: "352820", name: "하이브",          market: "KOSPI",  sector: "엔터테인먼트", yahooSymbol: "352820.KS" },
  { id: "018260", name: "삼성에스디에스",  market: "KOSPI",  sector: "IT서비스",     yahooSymbol: "018260.KS" },
  { id: "036570", name: "엔씨소프트",      market: "KOSPI",  sector: "게임",         yahooSymbol: "036570.KS" },
  { id: "030200", name: "KT",              market: "KOSPI",  sector: "통신",         yahooSymbol: "030200.KS" },
  { id: "000080", name: "하이트진로",      market: "KOSPI",  sector: "식음료",       yahooSymbol: "000080.KS" },
  { id: "023530", name: "롯데쇼핑",        market: "KOSPI",  sector: "유통",         yahooSymbol: "023530.KS" },
  { id: "139480", name: "이마트",          market: "KOSPI",  sector: "유통",         yahooSymbol: "139480.KS" },
  { id: "021240", name: "코웨이",          market: "KOSPI",  sector: "환경가전",     yahooSymbol: "021240.KS" },
  { id: "004370", name: "농심",            market: "KOSPI",  sector: "식품",         yahooSymbol: "004370.KS" },
  { id: "011200", name: "HMM",             market: "KOSPI",  sector: "해운",         yahooSymbol: "011200.KS" },
  // 010620 HD현대미포 — Yahoo 심볼 없음(상장폐지 의심)으로 제거 (2026-06-19)
  // 001570 금양 — 거래 정지로 제거 (2026-06-19)
  { id: "003490", name: "대한항공",        market: "KOSPI",  sector: "항공",         yahooSymbol: "003490.KS" },
  { id: "005945", name: "NH투자증권",      market: "KOSPI",  sector: "금융",         yahooSymbol: "005945.KS" },
  { id: "000120", name: "CJ대한통운",      market: "KOSPI",  sector: "물류",         yahooSymbol: "000120.KS" },
  { id: "285130", name: "SK케미칼",        market: "KOSPI",  sector: "화학/제약",    yahooSymbol: "285130.KS" },
  { id: "161390", name: "한국타이어앤테크놀로지", market: "KOSPI", sector: "자동차부품", yahooSymbol: "161390.KS" },
  { id: "009830", name: "한화솔루션",      market: "KOSPI",  sector: "태양광/화학",  yahooSymbol: "009830.KS" },
  { id: "006800", name: "미래에셋증권",    market: "KOSPI",  sector: "금융",         yahooSymbol: "006800.KS" },
  { id: "029780", name: "삼성카드",        market: "KOSPI",  sector: "금융",         yahooSymbol: "029780.KS" },
  { id: "000990", name: "DB하이텍",        market: "KOSPI",  sector: "반도체",       yahooSymbol: "000990.KS" },
  { id: "051600", name: "한전KPS",         market: "KOSPI",  sector: "전력",         yahooSymbol: "051600.KS" },
  { id: "016360", name: "삼성증권",        market: "KOSPI",  sector: "금융",         yahooSymbol: "016360.KS" },
  { id: "454910", name: "두산로보틱스",    market: "KOSPI",  sector: "로봇",         yahooSymbol: "454910.KS" },

  // ── KOSDAQ ─────────────────────────────────────────────
  { id: "247540", name: "에코프로비엠",    market: "KOSDAQ", sector: "2차전지소재",  yahooSymbol: "247540.KQ" },
  { id: "086520", name: "에코프로",        market: "KOSDAQ", sector: "2차전지소재",  yahooSymbol: "086520.KQ" },
  { id: "196170", name: "알테오젠",        market: "KOSDAQ", sector: "바이오",       yahooSymbol: "196170.KQ" },
  { id: "028300", name: "HLB",             market: "KOSDAQ", sector: "바이오",       yahooSymbol: "028300.KQ" },
  { id: "058470", name: "리노공업",        market: "KOSDAQ", sector: "반도체",       yahooSymbol: "058470.KQ" },
  { id: "068760", name: "셀트리온제약",    market: "KOSDAQ", sector: "제약",         yahooSymbol: "068760.KQ" },
  { id: "293490", name: "카카오게임즈",    market: "KOSDAQ", sector: "게임",         yahooSymbol: "293490.KQ" },
  // 066970 엘앤에프 — Yahoo 심볼 없음으로 제거 (2026-06-19)
  { id: "214150", name: "클래시스",        market: "KOSDAQ", sector: "의료기기",     yahooSymbol: "214150.KQ" },
  { id: "277810", name: "레인보우로보틱스", market: "KOSDAQ", sector: "로봇",        yahooSymbol: "277810.KQ" },
  { id: "041510", name: "에스엠",          market: "KOSDAQ", sector: "엔터테인먼트", yahooSymbol: "041510.KQ" },
  { id: "035900", name: "JYP Ent.",        market: "KOSDAQ", sector: "엔터테인먼트", yahooSymbol: "035900.KQ" },
  { id: "122870", name: "와이지엔터테인먼트", market: "KOSDAQ", sector: "엔터테인먼트", yahooSymbol: "122870.KQ" },
  { id: "263750", name: "펄어비스",        market: "KOSDAQ", sector: "게임",         yahooSymbol: "263750.KQ" },
  { id: "251270", name: "넷마블",          market: "KOSDAQ", sector: "게임",         yahooSymbol: "251270.KQ" },
  // 091990 셀트리온헬스케어 — 셀트리온(068270) 합병 상장폐지로 제거 (2026-06-19)
  { id: "145020", name: "휴젤",            market: "KOSDAQ", sector: "바이오",       yahooSymbol: "145020.KQ" },
  { id: "000250", name: "삼천당제약",      market: "KOSDAQ", sector: "제약",         yahooSymbol: "000250.KQ" },
  { id: "018290", name: "브이티",          market: "KOSDAQ", sector: "뷰티",         yahooSymbol: "018290.KQ" },
  { id: "039030", name: "이오테크닉스",    market: "KOSDAQ", sector: "반도체장비",   yahooSymbol: "039030.KQ" },
  { id: "357780", name: "솔브레인",        market: "KOSDAQ", sector: "반도체소재",   yahooSymbol: "357780.KQ" },
  { id: "240810", name: "원익IPS",         market: "KOSDAQ", sector: "반도체장비",   yahooSymbol: "240810.KQ" },
  { id: "096530", name: "씨젠",            market: "KOSDAQ", sector: "진단",         yahooSymbol: "096530.KQ" },
  { id: "950130", name: "엑세스바이오",    market: "KOSDAQ", sector: "진단",         yahooSymbol: "950130.KQ" },
  { id: "200130", name: "카카오페이",      market: "KOSDAQ", sector: "핀테크",       yahooSymbol: "377300.KS" },
  { id: "403870", name: "HPSP",            market: "KOSDAQ", sector: "반도체장비",   yahooSymbol: "403870.KQ" },
  { id: "078340", name: "컴투스",          market: "KOSDAQ", sector: "게임",         yahooSymbol: "078340.KQ" },
  { id: "950210", name: "프레스티지바이오파마", market: "KOSDAQ", sector: "바이오",  yahooSymbol: "950210.KQ" },
  { id: "064350", name: "현대로템",        market: "KOSDAQ", sector: "방산/철도",    yahooSymbol: "064350.KQ" },
  { id: "112040", name: "위메이드",        market: "KOSDAQ", sector: "게임",         yahooSymbol: "112040.KQ" },
];

async function main() {
  console.log(`\n종목 시드 시작 — 총 ${STOCKS.length}개\n`);

  let created = 0;
  let updated = 0;

  for (const stock of STOCKS) {
    const result = await prisma.stock.upsert({
      where: { id: stock.id },
      create: stock,
      update: { name: stock.name, sector: stock.sector, yahooSymbol: stock.yahooSymbol },
    });
    if (result.name === stock.name) {
      created++;
    } else {
      updated++;
    }
    process.stdout.write(`  ${stock.market} ${stock.id} ${stock.name}\n`);
  }

  const total = await prisma.stock.count();
  console.log(`\n완료 — 신규 ${created}개 / 업데이트 ${updated}개 / DB 총 ${total}개\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
