<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.2.9) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## 확인된 Breaking Changes (Next.js 16)

### Dynamic Route Handler params → Promise
```typescript
// ❌ 이전 방식 (404 오류 발생)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
}

// ✅ Next.js 16 방식
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```
<!-- END:nextjs-agent-rules -->

---

## 프로젝트 기술 스택

- **Framework**: Next.js 16.2.9 (App Router)
- **DB**: Prisma 5 + SQLite (`prisma/dev.db`)
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts
- **Auth**: NextAuth

## 외부 API 제약사항

### OpenFIGI (CUSIP → 티커 매핑)
- 무료 플랜: **요청당 최대 10개**, 25요청/분
- 100개 배치 시 HTTP 413 오류 발생
- 요청 간 2.5초 sleep 필수

### SEC EDGAR
- `User-Agent` 헤더 필수: `"investing-manager/1.0 admin@example.com"`
- 13F XML에 네임스페이스 접두사 존재 → 파싱 전 제거 필요
  ```typescript
  xml = xml.replace(/<(\/?)\w+:(\w)/g, "<$1$2");
  ```
- filing index의 XML href는 `/Archives/...` 절대경로
  → `https://www.sec.gov${href}` 로 변환
- XSLT 래퍼 경로(`xslForm13F_X02/`) 제외하고 원본 XML 사용

### NAVER Finance (PER·PBR·배당수익률)
- `https://finance.naver.com/item/main.naver?code={종목코드}`
- HTML에서 `id="_per"`, `id="_pbr"`, `id="_cns_per"`, `id="_cns_eps"`, `id="_dvr"` 파싱

## SQLite 제약사항

- 대량 병렬 upsert 시 `SQLITE_BUSY` 또는 500 오류 발생
- Promise.all로 한 번에 처리 가능한 한계: **약 20개**
- 해결: 배치 처리
  ```typescript
  const BATCH = 20;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(rows.slice(i, i + BATCH).map(row => prisma.xxx.upsert(...)));
  }
  ```

## 수집 스크립트 실행 방법

```bash
# 주가·PER·PBR 수집 (POST /api/screener/collect)
# DART 재무 수집 (POST /api/screener/financial)
# 13F 수집 (POST /api/gurus/collect)
# OECD CLI 수집
node scripts/collect-cli.mjs
```

## 주요 대가 CIK (검증 완료)

| 대가 | 펀드 | CIK |
|------|------|-----|
| Warren Buffett | Berkshire Hathaway | 0001067983 |
| Bill Ackman | Pershing Square Capital | 0001336528 |
| Michael Burry | Scion Asset Management | 0001649339 |
| Ray Dalio | Bridgewater Associates | 0001350694 |
| David Tepper | Appaloosa LP | 0001656456 |
| Stanley Druckenmiller | Duquesne Family Office | 0001536411 |
| Seth Klarman | Baupost Group/MA | 0001061768 |
| Li Lu | Himalaya Capital | 0001709323 |
