export type Sentiment = "strong_bull" | "bull" | "neutral" | "bear" | "strong_bear";

export interface InsightPoint {
  category: string;
  icon: string;
  text: string;
  signal: "positive" | "negative" | "neutral" | "warning";
}

export interface MarketSummary {
  sentiment: Sentiment;
  sentimentLabel: string;
  headline: string;
  points: InsightPoint[];
  implication: string;
}

interface Ind {
  type: string;
  value: number;
  change: number;
  changePercent: number;
}

function fmt(v: number, dp = 2) {
  return v.toFixed(dp);
}

function pctStr(v: number, dp = 2) {
  return `${v > 0 ? "+" : ""}${fmt(v, dp)}%`;
}

export function generateMarketSummary(indicators: Ind[]): MarketSummary {
  const m = Object.fromEntries(indicators.map((i) => [i.type, i]));

  const vix       = m.VIX?.value         ?? 20;
  const kospiChg  = m.KOSPI?.changePercent  ?? 0;
  const sp500Chg  = m.SP500?.changePercent  ?? 0;
  const soxChg    = m.SOX?.changePercent    ?? 0;
  const usCpi     = m.US_CPI?.value         ?? 3;
  const cpi       = m.CPI?.value            ?? 2.5;
  const bokRate   = m.BOK_BASE_RATE?.value  ?? 3;
  const fedRate   = m.FED_RATE?.value       ?? 4;
  const krwUsd    = m.KRW_USD?.value        ?? 1300;
  const krwChg    = m.KRW_USD?.changePercent ?? 0;
  const cli       = m.CLI?.value            ?? 100;
  const fearGreed = m.FEAR_GREED?.value     ?? 50;
  const nasdaq100Chg = m.NASDAQ100?.changePercent ?? 0;

  // ── 종합 점수 계산 ────────────────────────────────
  let score = 0;

  // VIX: 낮을수록 긍정
  if (vix < 13)      score += 3;
  else if (vix < 16) score += 2;
  else if (vix < 20) score += 1;
  else if (vix < 25) score -= 1;
  else if (vix < 30) score -= 2;
  else               score -= 4;

  // 국내 주가
  if      (kospiChg >  2)    score += 2;
  else if (kospiChg >  0.5)  score += 1;
  else if (kospiChg < -2)    score -= 2;
  else if (kospiChg < -0.5)  score -= 1;

  // 미국 주가
  if      (sp500Chg >  1.5)  score += 2;
  else if (sp500Chg >  0.5)  score += 1;
  else if (sp500Chg < -1.5)  score -= 2;
  else if (sp500Chg < -0.5)  score -= 1;

  // 미국 물가: 높을수록 부정 (금리 인하 제약)
  if      (usCpi > 5)   score -= 3;
  else if (usCpi > 4)   score -= 2;
  else if (usCpi > 3)   score -= 1;
  else if (usCpi < 2.5) score += 1;
  else if (usCpi < 2)   score += 2;

  // 경기 선행지수
  if      (cli > 101)  score += 1;
  else if (cli < 99)   score -= 1;

  // 투자 심리
  if      (fearGreed > 70) score += 1;
  else if (fearGreed < 25) score -= 2;
  else if (fearGreed < 35) score -= 1;

  // ── 센티먼트 결정 ─────────────────────────────────
  let sentiment: Sentiment;
  if      (score >= 6)  sentiment = "strong_bull";
  else if (score >= 3)  sentiment = "bull";
  else if (score >= 0)  sentiment = "neutral";
  else if (score >= -3) sentiment = "bear";
  else                  sentiment = "strong_bear";

  const LABELS: Record<Sentiment, string> = {
    strong_bull: "강한 강세",
    bull:        "강세",
    neutral:     "중립",
    bear:        "약세",
    strong_bear: "강한 약세",
  };

  // ── 헤드라인 ──────────────────────────────────────
  const HEADLINES: Record<Sentiment, string> = {
    strong_bull:
      `KOSPI ${(m.KOSPI?.value ?? 0).toLocaleString()}p · VIX ${fmt(vix, 1)} — 위험자산 우호 환경, 강세장 유지`,
    bull:
      `주식시장 상승 기조 유지, 변동성 안정적 — 전반적으로 양호한 투자 환경`,
    neutral:
      `주식·금리·물가 신호 혼재 — 방향성 불확실, 성향 기반 포트폴리오 점검 시점`,
    bear:
      `시장 불안 요인 증대, VIX ${fmt(vix, 1)} 상승 — 방어적 포지션 점검 권장`,
    strong_bear:
      `시장 극단적 공포 구간(VIX ${fmt(vix, 1)}) — 장기 투자 원칙 유지 최우선`,
  };

  // ── 핵심 포인트 4개 ───────────────────────────────
  const points: InsightPoint[] = [];

  // 1. 주식시장 & 변동성
  {
    const sig = kospiChg > 0.5 ? "positive" : kospiChg < -0.5 ? "negative" : "neutral";
    const vixDesc =
      vix < 15 ? "극도 안정" : vix < 20 ? "안정" : vix < 25 ? "주의" : vix < 30 ? "위험" : "공포";

    let text = "";
    const soxNote = Math.abs(soxChg) > 2
      ? ` / SOX ${pctStr(soxChg, 1)} — AI·반도체 ${soxChg > 0 ? "강세" : "약세"}`
      : "";
    if (Math.abs(kospiChg) < 0.1 && Math.abs(sp500Chg) < 0.1) {
      text = `KOSPI · S&P 500 보합권, VIX ${fmt(vix, 1)} (${vixDesc}) — 관망 장세${soxNote}`;
    } else {
      text = `KOSPI ${pctStr(kospiChg, 1)} · S&P 500 ${pctStr(sp500Chg, 1)} · NASDAQ ${pctStr(nasdaq100Chg, 1)}, VIX ${fmt(vix, 1)} (${vixDesc})${soxNote}`;
    }
    points.push({ category: "주식 · 변동성", icon: "📈", text, signal: sig });
  }

  // 2. 금리
  {
    const rateEnv =
      bokRate <= 2.25 ? "적극 완화" :
      bokRate <= 2.75 ? "완화 기조" :
      bokRate <= 3.25 ? "중립" :
      bokRate <= 3.75 ? "긴축 완화 중" : "고금리";

    const rateImpact =
      bokRate <= 2.75 ? "채권형·혼합형 유리, 원리금보장 수익률 하락 시작" :
      bokRate <= 3.25 ? "원리금보장 양호, 채권형도 금리 하락 수혜 기대" :
      "원리금보장 상품 수익률 우수, 채권 가격 하락 주의";

    const fedNote = fedRate <= 3.5 ? "연준 인하 여력 있음" :
                    fedRate <= 4.0 ? "연준 동결 기조" : "연준 고금리 유지";

    const sig: InsightPoint["signal"] =
      bokRate <= 2.75 ? "positive" : bokRate >= 4.0 ? "warning" : "neutral";

    points.push({
      category: "금리",
      icon: "🏦",
      text: `한국 ${fmt(bokRate, 2)}% (${rateEnv}) · 미국 ${fmt(fedRate, 2)}% (${fedNote}) — ${rateImpact}`,
      signal: sig,
    });
  }

  // 3. 물가
  {
    const usCpiDesc =
      usCpi > 4   ? `미국 CPI ${fmt(usCpi, 1)}% — 인플레이션 심각, 금리 인하 불가` :
      usCpi > 3   ? `미국 CPI ${fmt(usCpi, 1)}% — 목표치 상회, 연준 금리 인하 신중` :
      usCpi > 2.5 ? `미국 CPI ${fmt(usCpi, 1)}% — 디스인플레이션 진행, 인하 기대 유효` :
                    `미국 CPI ${fmt(usCpi, 1)}% — 물가 안정, 금리 인하 여건 조성`;

    const krCpiNote = cpi > 3 ? ` · 한국 CPI ${fmt(cpi, 1)}% 이상 신호` :
                      cpi < 2 ? ` · 한국 CPI ${fmt(cpi, 1)}% 안정` :
                                ` · 한국 CPI ${fmt(cpi, 1)}%`;

    const sig: InsightPoint["signal"] =
      usCpi > 4 ? "negative" : usCpi > 3 ? "warning" : usCpi < 2.5 ? "positive" : "neutral";

    points.push({
      category: "물가",
      icon: "📊",
      text: `${usCpiDesc}${krCpiNote}`,
      signal: sig,
    });
  }

  // 4. 환율 & 경기
  {
    const fxDesc =
      krwUsd > 1480 ? "원화 급약세 — 해외자산 환차익 극대화, 수입 물가 상승 주의" :
      krwUsd > 1400 ? "원화 약세 — 해외주식형 환차익 효과, 수입 물가 상승 압력" :
      krwUsd > 1250 ? "원화 중립 — 환 헤지 여부 확인 권장" :
                      "원화 강세 — 해외자산 환차익 감소, 국내자산 상대 유리";

    const cliNote =
      cli > 101 ? ` · CLI ${fmt(cli, 1)} 경기 확장` :
      cli < 99  ? ` · CLI ${fmt(cli, 1)} 경기 위축` :
                  ` · CLI ${fmt(cli, 1)} 경기 보합`;

    const sig: InsightPoint["signal"] =
      krwUsd > 1450 ? "warning" : krwUsd < 1200 ? "neutral" : "neutral";

    points.push({
      category: "환율 · 경기",
      icon: "💱",
      text: `원/달러 ${krwUsd.toLocaleString()}원 (${pctStr(krwChg, 1)}) — ${fxDesc}${cliNote}`,
      signal: sig,
    });
  }

  // ── 퇴직연금 시사점 ───────────────────────────────
  const IMPLICATIONS: Record<Sentiment, string> = {
    strong_bull:
      "위험자산 선호 환경 — 성향별 주식형 비중 유지하되 단기 과열 가능성 점검, 정기 리밸런싱 확인",
    bull:
      "양호한 투자 환경 — 기존 포트폴리오 유지하며 반기 리밸런싱 일정 확인",
    neutral:
      "방향성 불확실 — 성향 진단 기반 자산 배분 점검, 분산 투자 원칙 준수",
    bear:
      "시장 불안 확대 — 안정형일수록 채권·원리금보장 비중 확인, 섣부른 전액 환매 자제",
    strong_bear:
      "공포 극단 구간 — 장기 투자 원칙 최우선 유지, 급격한 포트폴리오 변경 자제",
  };

  return {
    sentiment,
    sentimentLabel: LABELS[sentiment],
    headline: HEADLINES[sentiment],
    points,
    implication: IMPLICATIONS[sentiment],
  };
}
