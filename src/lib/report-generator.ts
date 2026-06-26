import { prisma } from "./prisma";
import { loggedFetch } from "./logged-fetch";

const TYPES = ["KOSPI", "KOSDAQ", "KRW_USD", "SP500", "VIX", "US_TREASURY_10Y"] as const;

async function getIndicator(type: string) {
  const rows = await prisma.indicatorRecord.findMany({
    where: { type },
    orderBy: { recordedAt: "desc" },
    take: 2,
    select: { value: true },
  });
  const latest = rows[0]?.value ?? null;
  const prev   = rows[1]?.value ?? null;
  const change = latest != null && prev != null && prev !== 0
    ? parseFloat(((latest - prev) / Math.abs(prev) * 100).toFixed(2))
    : null;
  return { value: latest, change };
}

async function generateAiSummary(data: Record<string, { value: number | null; change: number | null }>, dateStr: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const fmt = (v: number | null, d = 0) => v != null ? v.toLocaleString("en-US", { maximumFractionDigits: d }) : "데이터 없음";
  const fmtC = (c: number | null) => c != null ? `${c > 0 ? "+" : ""}${c}%` : "";

  const vix = data.VIX.value;
  const sp500Change = data.SP500.change;
  const kospiChange = data.KOSPI.change;
  const us10yChange = data.US_TREASURY_10Y.change;

  // 포트폴리오 조정 트리거 조건 힌트
  const rebalanceTriggers: string[] = [];
  if (vix != null && vix >= 25)                          rebalanceTriggers.push(`VIX ${vix} — 공포지수 급등(25 이상), 위험자산 축소 검토`);
  if (sp500Change != null && sp500Change <= -3)          rebalanceTriggers.push(`S&P500 ${sp500Change}% 급락 — 글로벌 주식 비중 점검 필요`);
  if (kospiChange != null && kospiChange <= -3)          rebalanceTriggers.push(`KOSPI ${kospiChange}% 급락 — 국내 주식 비중 점검 필요`);
  if (us10yChange != null && us10yChange >= 0.15)        rebalanceTriggers.push(`미국채 10년 금리 ${us10yChange}%p 급등 — 채권 비중 축소 / 주식 비중 재검토`);
  if (us10yChange != null && us10yChange <= -0.15)       rebalanceTriggers.push(`미국채 10년 금리 ${us10yChange}%p 급락 — 채권 비중 확대 기회`);
  if (data.KRW_USD.change != null && Math.abs(data.KRW_USD.change) >= 1.5) rebalanceTriggers.push(`환율 ${data.KRW_USD.change}% 급변 — 해외 자산 환헤지 비중 점검`);

  const prompt = `오늘 ${dateStr}의 시장 데이터를 바탕으로 아래 형식에 맞게 작성해주세요.

## 시장 데이터
- KOSPI: ${fmt(data.KOSPI.value)} ${fmtC(data.KOSPI.change)}
- KOSDAQ: ${fmt(data.KOSDAQ.value)} ${fmtC(data.KOSDAQ.change)}
- 원달러 환율: ${fmt(data.KRW_USD.value)}원 ${fmtC(data.KRW_USD.change)}
- S&P500: ${fmt(data.SP500.value)} ${fmtC(data.SP500.change)}
- VIX(공포지수): ${fmt(data.VIX.value, 2)}
- 미국채 10년: ${fmt(data.US_TREASURY_10Y.value, 2)}% ${fmtC(data.US_TREASURY_10Y.change)}

## 작성 규칙
1. summaryKr (한국 시황): 첫 줄은 "KOSPI {값} {등락률}% | KOSDAQ {값} | 환율 {값}원" 형식의 한 줄 요약. 그 다음 줄부터 주요 이슈를 "• " 로 시작하는 불릿으로 5개 이내 작성. 전체 1000자 이내.
2. summaryUs (미국 시황): 첫 줄은 "S&P500 {값} {등락률}% | VIX {값} | 미국채10Y {값}%" 형식의 한 줄 요약. 그 다음 줄부터 주요 이슈를 "• " 로 시작하는 불릿으로 5개 이내 작성. 전체 1000자 이내.
3. insightDcIrp (퇴직연금 시사점): DC/IRP 장기투자자 관점의 핵심 시사점을 2~3문장으로 작성.${
    rebalanceTriggers.length > 0
      ? `\n   ⚠️ 포트폴리오 비중 조정 알림 필요 조건 감지됨:\n   ${rebalanceTriggers.map((t) => `- ${t}`).join("\n   ")}\n   위 조건을 반드시 insightDcIrp에 포함하고, 앞에 "🚨 비중 조정 검토:" 라는 라벨을 붙여 강조해주세요.`
      : "\n   특이사항 없으면 현 비중 유지 판단 여부를 간략히 서술."
  }

반드시 아래 JSON 형식으로만 응답해주세요:
{"summaryKr":"...","summaryUs":"...","insightDcIrp":"..."}`;

  try {
    const res = await loggedFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "당신은 퇴직연금(DC/IRP) 가입자를 위한 금융 시황 분석가입니다. 투자 결정을 직접 권고하지 않으며 정보 제공 목적으로만 시황을 설명합니다. 전문 용어는 쉽게 설명합니다. 항상 JSON 형식으로만 응답합니다.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "";

    // JSON 블록 추출
    const match = text.match(/\{[\s\S]*"summaryKr"[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as { summaryKr: string; summaryUs: string; insightDcIrp: string };
  } catch { return null; }
}

export async function generateReport(date?: Date, options?: { force?: boolean }) {
  const targetDate = date ?? new Date();
  const dateKey = new Date(targetDate.toISOString().slice(0, 10) + "T00:00:00.000Z");

  // 이미 완료된 리포트면 반환 (force=true 시 재생성)
  const existing = await prisma.marketReport.findUnique({ where: { date: dateKey } });
  if (existing?.status === "done" && !(options?.force)) return existing;

  // pending 또는 신규 생성
  const report = await prisma.marketReport.upsert({
    where:  { date: dateKey },
    create: { date: dateKey, status: "pending" },
    update: { status: "pending" },
  });

  try {
    // 지표 수집
    const [kospi, kosdaq, krwUsd, sp500, vix, us10y] = await Promise.all(
      TYPES.map((t) => getIndicator(t))
    );
    const data = { KOSPI: kospi, KOSDAQ: kosdaq, KRW_USD: krwUsd, SP500: sp500, VIX: vix, US_TREASURY_10Y: us10y };

    const dateStr = targetDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    const ai = await generateAiSummary(data, dateStr);

    const updated = await prisma.marketReport.update({
      where: { id: report.id },
      data: {
        kospi:        kospi.value,  kospiChange:  kospi.change,
        kosdaq:       kosdaq.value, kosdaqChange: kosdaq.change,
        krwUsd:       krwUsd.value, krwUsdChange: krwUsd.change,
        sp500:        sp500.value,  sp500Change:  sp500.change,
        vix:          vix.value,
        us10y:        us10y.value,  us10yChange:  us10y.change,
        summaryKr:    ai?.summaryKr    ?? null,
        summaryUs:    ai?.summaryUs    ?? null,
        insightDcIrp: ai?.insightDcIrp ?? null,
        status: "done",
        generatedAt: new Date(),
      },
    });

    return updated;
  } catch {
    await prisma.marketReport.update({ where: { id: report.id }, data: { status: "failed" } });
    throw new Error("리포트 생성 실패");
  }
}
