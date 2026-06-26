# 관리자 API 호출 상태 조회 기능 — 규격서

> 상태: **규격 확정 (구현 대기)** · 작성 2026-06-26 · 검토 javis(pm-orchestrator)
> 결정 확정: 조회 대상 = (A) 외부 API 헬스/응답상태 + (C) 수집작업 실행 이력 · 권한 = `ADMIN_EMAILS` 환경변수

---

## 1. 목적

관리자가 **이 서비스가 의존하는 외부 API들의 현재 응답 상태**와 **내부 수집 작업의 실행 이력(성공/실패)**을 한 화면에서 점검할 수 있게 한다.
현재 코드베이스에는 관리자 역할도, API 호출 로그도 존재하지 않으므로 두 개의 신규 인프라(권한 게이팅 + 호출 상태 기록/조회)를 도입한다.

### 범위 결정
- ✅ **(A) 외부 API 헬스/응답상태** — up/down·응답시간·마지막 성공 시각
- ✅ **(C) 수집작업 실행 이력** — 작업별 성공/실패·건수·소요시간·에러
- ⛔ **(B) 호출량·레이트리밋 사용량 추적** — 계측 부담이 커서 **후속 페이즈로 분리**(이번 MVP 제외)

---

## 2. 대상 외부 API

| API | 용도 | 헬스체크 방법(후보) |
|-----|------|---------------------|
| NAVER Finance | 주가·PER·PBR·외국인 보유율 | item 페이지 또는 m.stock 경량 요청 |
| DART | 재무·자사주·내부자 | API 상태 엔드포인트 또는 corpCode 핑 |
| SEC EDGAR | 13F | submissions 경량 GET (User-Agent 필수) |
| OpenFIGI | CUSIP→티커 | mapping 1건 핑 (레이트리밋 주의) |
| OpenRouter | 린치·시황 AI | `/models` 또는 잔액/키 검증 (현재 크레딧 0 → 402) |
| OECD | CLI 지표 | dataset 경량 요청 |

> 헬스체크는 **읽기 전용 경량 요청**만 사용한다. 레이트리밋이 빡빡한 OpenFIGI는 핑 주기를 길게(또는 캐시된 마지막 수집 결과 기반 추정)로 보호한다.

---

## 3. 권한 모델 (확정: ADMIN_EMAILS)

- 환경변수 `ADMIN_EMAILS`(콤마 구분 이메일 화이트리스트)로 게이팅. DB 마이그레이션 불필요.
- 신규 헬퍼 `src/lib/admin.ts`:
  ```ts
  export function isAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const list = (process.env.ADMIN_EMAILS ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return list.includes(email.toLowerCase());
  }
  ```
- 기존 `isAuthorizedCron`(`src/lib/cron-self.ts`)과 동일한 "라우트 가드" 패턴을 따른다.
- 어드민 API 라우트·페이지는 `auth()` 세션 이메일을 `isAdminEmail`로 검사, 미충족 시 **404**(존재 은닉) 또는 403.
- Vercel 환경변수에 `ADMIN_EMAILS` 추가 필요(배포 의존성).

---

## 4. 데이터 모델 (Prisma 신규)

### 4.1 ExternalApiHealth — 외부 API 헬스 (API당 1행, upsert)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String @id | cuid |
| apiKey | String @unique | "NAVER"·"DART"·"EDGAR"·"OPENFIGI"·"OPENROUTER"·"OECD" |
| status | String | "up" \| "down" \| "degraded" |
| httpStatus | Int? | 마지막 체크 HTTP 코드 |
| latencyMs | Int? | 응답시간 |
| lastSuccessAt | DateTime? | 마지막 성공 시각 |
| lastCheckedAt | DateTime | 마지막 체크 시각 |
| message | String? | 에러/비고 |

### 4.2 CollectionRun — 수집 작업 실행 이력 (실행당 1행, append)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String @id | cuid |
| job | String | "stocks"·"financials"·"gurus"·"daily"·"refresh-universe"·"history" |
| status | String | "success" \| "failed" \| "partial" |
| itemsOk | Int | 성공 건수 |
| itemsFailed | Int | 실패 건수 |
| durationMs | Int | 소요시간 |
| error | String? | 실패 사유(truncate) |
| startedAt | DateTime | 시작 |
| finishedAt | DateTime | 종료 |

- 인덱스: `@@index([job, startedAt])`. 보존: 최근 N일/행만(예: 30일) — 정리 잡 또는 조회 시 limit.
- 적용: 라이브는 Supabase Postgres → `prisma db push` (memory: db-is-postgres-not-sqlite).

---

## 5. 계측 지점 (수집 이력 기록)

기존 cron/수집 라우트 종료부에 `CollectionRun` 1행 기록을 추가한다. **수집 핵심 로직은 변경 없이 try/finally 래핑만** 추가(실패 격리 유지).

| 라우트 | job |
|--------|-----|
| `src/app/api/cron/collect-stocks/route.ts` | stocks |
| `src/app/api/cron/collect-financials/route.ts` | financials |
| `src/app/api/gurus/collect/route.ts` | gurus |
| `src/app/api/cron/daily/route.ts` | daily |
| `src/app/api/cron/refresh-universe/route.ts` | refresh-universe |
| `src/app/api/collect/history/route.ts` | history |

> 슬라이스/self-chaining 구조(collect-stocks 등)는 슬라이스마다 기록하면 행이 폭증 → **잡 단위 집계 1행**(또는 슬라이스 0=시작, 마지막=종료) 정책을 super가 확정.

---

## 6. API 엔드포인트 (신규)

모두 `isAdminEmail` 가드. 경로 prefix `/api/admin/*`.

| 메서드·경로 | 동작 |
|-------------|------|
| `GET /api/admin/api-status` | ExternalApiHealth 전체 + 최근 CollectionRun N건 조회 |
| `POST /api/admin/api-status/check` | 외부 API 헬스 즉시 재점검(온디맨드) → ExternalApiHealth upsert |

- 헬스 갱신 경로: ① cron daily 종료 시 일괄 점검 ② 어드민 화면의 "지금 점검" 버튼(POST check).
- check는 외부 호출 발생 → 레이트리밋·비용 고려해 **레이트 가드**(예: 최소 60초 간격) 둔다.

---

## 7. 어드민 UI

- 위치: `/admin/api-status` (신규 `src/app/admin/api-status/page.tsx`). 사이드바엔 **관리자에게만** "관리자" 섹션 노출(`isAdminEmail`).
- 구성:
  - **외부 API 헬스 카드 그리드**: API별 up/down 배지·응답시간·마지막 성공 시각·"지금 점검" 버튼.
  - **수집 이력 테이블**: 최근 실행(job·status·성공/실패 건수·소요시간·시각·에러).
- 비관리자 접근 시 404. 모바일 반응형(프로젝트 원칙: Playwright 실측 검증).

---

## 8. 미확정 / super·wonder가 확정할 세부

1. 슬라이스형 수집(collect-stocks/financials)의 이력 기록 단위 — 잡 집계 1행 vs 슬라이스별.
2. 외부 헬스체크 실제 경량 엔드포인트 확정(특히 OpenFIGI 레이트리밋 보호 방식: 실호출 vs 마지막 수집 성공 기반 추정).
3. CollectionRun 보존 정책(30일 cap + 정리 잡 위치).
4. OpenRouter 헬스 표시 방식 — 402(크레딧 0)를 "down"이 아니라 "degraded/크레딧 부족"으로 구분 표기.
5. 비관리자 응답 코드 404 vs 403 통일.

---

## 9. 진행 순서 (javis 제안)

1. **super** — Prisma 모델 2종 + `isAdminEmail` 헬퍼 + `/api/admin/*` 라우트 + 6장 계측 지점 + db push.
2. **wonder** — `/admin/api-status` 어드민 UI + 사이드바 관리자 섹션(반응형).
3. **sam** — 권한 게이팅(비관리자 404)·헬스/이력 표시·읽기전용 QA + E2E 편입 검토.

> 배포 의존성: Vercel 환경변수 `ADMIN_EMAILS` 추가, `prisma db push`로 신규 테이블 라이브 반영.

---

## 10. 구현 후 진화 (2026-06-26)

규격 확정·구현 후 운영하며 다음과 같이 변경됨(이 문서 §1~9는 초기 설계 기준).

1. **수집 이력(CollectionRun) UI → API 요청 로그(ApiRequestLog)로 대체.**
   - 목적이 "수집 잡 이력"에서 "시스템이 호출한 모든 외부 API 요청 모니터링"으로 확장.
   - 신규 모델 `ApiRequestLog`(Date/Time·apiKey·method·url·statusCode·responseTimeMs·ok·error).
   - 공용 래퍼 `src/lib/logged-fetch.ts`(`loggedFetch`)가 모든 외부 fetch를 계측 — NAVER·DART·EDGAR·OpenFIGI·OpenRouter·OECD·Yahoo. fire-and-forget 적재, 보존 7일(throttled 정리), URL 비밀 파라미터(crtfc_key 등) 마스킹.
   - `CollectionRun` 모델·계측은 유지(OpenFIGI 헬스 추정에 사용). 대시보드 하단 섹션만 교체.

2. **외부 API 헬스 UI 최소화 + 상세 팝업 모달.** 6개 카드 그리드 → 상태 점(dot) 균등 그리드 요약 바, "상세 보기" 클릭 시 모달로 전체 카드 표시(ESC·바깥클릭 닫기).

3. **OpenRouter 헬스 실사용 반영.** 린치 분석의 OpenRouter 실호출 결과를 `recordApiHealthObservation`로 헬스에 업서트 — "지금 점검" 외 실제 호출도 헬스 카드에 반영.

4. **로컬 startup 수집 게이팅.** `DISABLE_STARTUP_COLLECTION=true`(로컬 전용 env)면 `instrumentation.ts`의 기동 자동수집을 건너뜀 — Supabase 풀 고갈로 로그인 등이 막히던 문제 해소(운영 미설정 → 동작 유지).
