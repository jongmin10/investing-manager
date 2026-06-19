# 매수 종목 검색기 기능 규격

## 1. 개요

| 항목 | 내용 |
|------|------|
| 기능명 | 종목 스크리너 (`/screener`) |
| 접근 | 비로그인 사용 가능 |
| 목적 | 코스피·코스닥 전 종목 중 사용자 조건을 충족하는 매수 후보 종목 필터링 |

---

## 2. 스크리닝 조건 (UI 필터)

### 기본 조건
| 조건 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| 시장 | 선택 (코스피 / 코스닥 / 전체) | 코스피 | |
| 업종 | 다중 선택 | 전체 | IT, 바이오, 반도체 등 |
| 시가총액 | 범위 슬라이더 (억원) | 500억~무제한 | 소형주 제외 옵션 |

### 가격 조건
| 조건 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| 52주 신고가 근접 | 슬라이더 (%) | 90% 이상 | 현재가 ÷ 52주 최고가 ≥ N% |
| 주가 범위 | 범위 입력 (원) | - | 선택 조건 |
| 전일 대비 등락률 | 범위 슬라이더 (%) | - | 선택 조건 |

### 성장성 조건 (재무)
| 조건 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| 매출 성장률 (YoY) | 슬라이더 (%) | 10% 이상 | 최근 연간 기준 |
| 영업이익 성장률 (YoY) | 슬라이더 (%) | 10% 이상 | |
| 순이익 성장률 (YoY) | 슬라이더 (%) | - | 선택 조건 |
| 영업이익률 | 슬라이더 (%) | - | 현재 영업이익 ÷ 매출 |

### 가치 조건 (선택)
| 조건 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| PER | 범위 슬라이더 | - | |
| PBR | 범위 슬라이더 | - | |
| 거래량 | 최소값 입력 | - | 20일 평균 대비 배수 |

---

## 3. 데이터 소스

### 주가 데이터 — Yahoo Finance v8 API (기존 연동 활용)
- 개별 종목 심볼: `005930.KS` (삼성전자), `035720.KQ` (카카오) 형식
- 수집 가능 필드: 현재가, 52주 최고/최저, 시가총액, PER, PBR, 거래량
- 제약: rate limit 있음 → 배치 수집 후 DB 캐시 필수

### 재무 데이터 — DART OpenAPI (금융감독원)
- URL: `https://opendart.fss.or.kr`
- 무료 API 키 발급 (일 10,000건 한도)
- 수집 가능 필드: 매출액, 영업이익, 당기순이익 (분기/연간 사업보고서)
- 제약: 분기 보고서 기준이므로 최신 데이터는 1~3개월 지연 가능

### 종목 목록
- 초기 시드: 시가총액 상위 종목 하드코딩 (~100개)
- 전 종목 확장: KRX 상장종목 CSV (한국거래소 정보데이터시스템 무료 다운로드 후 import)

---

## 4. DB 스키마

```prisma
model Stock {
  id          String   @id       // 종목코드 6자리 (e.g. "005930")
  name        String             // 종목명
  market      String             // "KOSPI" | "KOSDAQ"
  sector      String?            // 업종명
  yahooSymbol String             // Yahoo Finance 심볼 (e.g. "005930.KS")
  dartCode    String?            // DART 고유번호 (재무데이터 수집용)

  snapshots   StockSnapshot[]
  financials  StockFinancial[]
}

model StockSnapshot {
  id           String   @id @default(cuid())
  stockId      String
  stock        Stock    @relation(fields: [stockId], references: [id])
  date         DateTime
  price        Float              // 현재가 (원)
  high52w      Float              // 52주 최고가
  low52w       Float              // 52주 최저가
  changeRate   Float?             // 전일 대비 등락률 (%)
  marketCap    Float?             // 시가총액 (억원)
  per          Float?
  pbr          Float?
  volume       Float?             // 거래량
  avgVolume20d Float?             // 20일 평균 거래량

  @@unique([stockId, date])
  @@index([date])
}

model StockFinancial {
  id              String   @id @default(cuid())
  stockId         String
  stock           Stock    @relation(fields: [stockId], references: [id])
  period          String   // "2024A" | "2024Q3" (연간A / 분기Q)
  revenue         Float?   // 매출액 (억원)
  operatingProfit Float?   // 영업이익 (억원)
  netIncome       Float?   // 당기순이익 (억원)
  revenueGrowth   Float?   // YoY 매출 성장률 (%)
  opGrowth        Float?   // YoY 영업이익 성장률 (%)
  netGrowth       Float?   // YoY 순이익 성장률 (%)
  opMargin        Float?   // 영업이익률 (%)

  @@unique([stockId, period])
  @@index([stockId])
}
```

---

## 5. 수집 아키텍처

```
[수집 트리거]
  수동: POST /api/screener/collect
  자동: 매일 오후 4시 (장 마감 후) — instrumentation.ts 또는 외부 cron

[수집 흐름]
  1. Stock 테이블에서 전 종목 로드
  2. Yahoo Finance 배치 수집 (50개씩, 500ms 딜레이)
     → StockSnapshot upsert
  3. DART API 재무 수집 (분기 1회)
     → StockFinancial upsert + 성장률 계산
```

| 수집 대상 | 주기 | API |
|-----------|------|-----|
| 주가·52주 고저·시가총액·PER | 매일 | Yahoo Finance |
| 매출·이익 성장률 | 분기 (보고서 공시 후) | DART OpenAPI |
| 종목 목록 | 수동 (신규 상장 시) | KRX CSV |

---

## 6. API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET`  | `/api/screener` | 조건 기반 종목 검색 (쿼리 파라미터) |
| `POST` | `/api/screener/collect` | 주가 스냅샷 수동 수집 트리거 |
| `GET`  | `/api/screener/status` | 마지막 수집 시각 및 종목 수 |

**GET `/api/screener` 쿼리 파라미터:**
```
?market=KOSPI
&high52wMin=90        # 52주 고가 대비 현재가 비율 최소값 (%)
&revenueGrowthMin=10  # 매출 성장률 최소 (%)
&opGrowthMin=10       # 영업이익 성장률 최소 (%)
&marketCapMin=500     # 시가총액 최소 (억원)
&perMax=30
&sector=반도체
&limit=50
```

---

## 7. UI 구성 (`/screener`)

```
/screener
├── 필터 패널 (상단 접이식)
│   ├── 기본: 시장, 업종, 시가총액
│   ├── 가격: 52주 신고가 근접 %, 등락률 범위
│   └── 재무: 매출/이익 성장률, PER, PBR       ← Phase 4에서 활성화
├── 결과 요약 ("32개 종목 · 기준일 2026-06-19 16:00")
├── 결과 테이블
│   ├── 종목명 / 코드 / 시장 / 업종
│   ├── 현재가 / 등락률
│   ├── 52주 고가 대비 (%)         ← 진행바 시각화
│   ├── 매출 성장 / 영업이익 성장  ← Phase 4
│   ├── 시가총액 / PER
│   └── Yahoo Finance 링크 아이콘
└── 수집 상태 배지 (마지막 업데이트 시각)
```

---

## 8. 구현 단계

| 단계 | 내용 | 상태 |
|------|------|------|
| **1단계** | DB 스키마 + 시가총액 상위 종목 시드 데이터 (~100개) | ✅ 완료 |
| **2단계** | Yahoo Finance 배치 수집 (주가·52주 고저·시가총액) + `/api/screener/collect` | 예정 |
| **3단계** | 스크리너 API + UI (시장·52주·시가총액 조건) | 예정 |
| **4단계** | DART API 연동 (재무 데이터·성장률 계산) | 예정 |
| **5단계** | 재무 조건 필터 + 자동 수집 스케줄 | 예정 |

---

## 9. 핵심 제약사항

- **DART API 키 필요**: 금감원 OpenAPI 사이트에서 무료 발급 후 `.env`에 `DART_API_KEY` 설정
- **전 종목 수집 시간**: 2,400개 × Yahoo Finance 요청 → 배치당 15~30분 예상, rate limit 관리 필수
- **재무 데이터 지연**: 분기 보고서 공시까지 1~3개월 lag 존재 (스크리너 결과에 명시 필요)
- **SQLite 한계**: 종목·스냅샷 데이터가 수십만 건이 되면 쿼리 성능 저하 가능 → 인덱스 설계 중요
