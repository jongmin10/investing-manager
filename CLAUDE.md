# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 운영 지침

- 파일/폴더 생성, 이동, 복사, 삭제 등 path 관련 작업은 별도 확인 없이 바로 실행한다.
- `docs/` 폴더 내 MD 파일 작성·수정은 항상 허용된 작업으로 간주한다.
- 작업 전 허가를 묻지 말고 진행한 뒤 결과를 보고한다.
- 모든 PowerShell 및 shell 명령은 별도 확인 없이 바로 실행한다.

## ⚠️ AGENTS.md / docs 의 stale 정보 정정

`@AGENTS.md` 와 `docs/CLAUDE.md` 는 초기 문서라 아래가 실제와 다르다. **여기 기재를 우선한다.**

- **DB 는 SQLite 가 아니라 PostgreSQL(Supabase)** 이다 (dev·prod 동일, `prisma/schema.prisma` provider = postgresql). AGENTS.md 의 "SQLite 제약사항"(SQLITE_BUSY·BATCH=20)·`prisma/dev.db` 기재는 무시한다.
- **스키마 반영은 마이그레이션이 아니라 `npx prisma db push`** 다. `prisma/migrations/` 폴더가 없다. `prisma migrate dev` 쓰지 말 것. (Vercel 빌드도 `prisma db push` 실행 — 아래 배포 참조.)
- **라우트 보호는 `middleware.ts` 가 아니라 `src/proxy.ts`** 다 (Next.js 16 에서 middleware 규약 → proxy 로 대체됨).

## 명령어

```bash
npm run dev                # 개발 서버 (http://localhost:3000)
npm run build              # 프로덕션 빌드 (내부적으로 prisma db push 포함 — vercel.json)
npm run lint               # ESLint
npx tsc --noEmit           # 타입 체크 (커밋/PR 전 필수)

npx prisma db push         # 스키마 → DB 반영 (마이그레이션 없음). dev 서버 중지 후 실행할 것(아래 Windows 주의)
npx prisma studio          # DB GUI
npm run db:seed            # 샘플 데이터 시드 (prisma/seed.ts)
npm run db:seed:etf        # ETF 수익률 시드 (prisma/seed-etf.ts)

# 테스트
npm run test:unit                                   # Vitest 단위 (src/**/*.test.ts)
npx vitest run src/lib/__tests__/xxx.test.ts        # 단일 파일
npx vitest run -t "테스트명"                         # 이름으로 단일 케이스
npm run test:e2e                                    # Playwright (desktop + Pixel 5 mobile 두 프로젝트)
npx playwright test e2e/portfolio.spec.ts --project=setup --project=desktop   # 단일 스펙(로그인 setup 선행)

# 데이터/자산 유틸
npm run gen:favicon        # src/app/icon.svg → favicon.ico 재생성 (아이콘 디자인 변경 시)
npm run etf:recalc         # EtfReturn CAGR 재계산 (--apply 로 반영). 롤링 20년 기준
npm run index:backfill     # 지수 히스토리 백필
node scripts/collect-cli.mjs   # OECD CLI 수집
```

### Windows 개발 주의

- **`next dev` 실행 중이면 `prisma generate`/`prisma db push` 가 DLL 잠금(EPERM)으로 실패**한다. dev 중지 후 실행할 것.
- 포트 3000 이 stale 프로세스에 점유되면 `pkill` 이 안 먹힐 수 있다. PowerShell 로 확실히 종료:
  `Get-NetTCPConnection -LocalPort 3000 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`

## 아키텍처 (빅픽처)

Next.js 16 App Router 단일 모놀리스(프론트 + API 라우트). `src/app`(페이지·API), `src/components`(UI), `src/lib`(도메인 로직), `prisma`(스키마·시드).

### 데이터 흐름 — 외부 API 는 사용자 요청 중에 호출하지 않는다

외부 API(SEC EDGAR·NAVER·DART·OpenFIGI·관세청·OpenRouter 등)는 **cron/수집 엔드포인트가 미리 DB(`IndicatorRecord` 시계열, 종목·13F 등)에 적재**하고, 사용자 요청은 DB만 읽는다.
- cron: `vercel.json` 에 `/api/cron/daily` (22:00 UTC = 07:00 KST) 하나. **API maxDuration 60s** 제약 때문에 장시간 작업은 슬라이스로 쪼개 self-chaining 한다(다른 `/api/cron/*`·`/api/**collect**` 엔드포인트 참조).
- `EtfReturn` 모델: `updateMethod` = `INDEX_CAGR`(지수 히스토리로 CAGR 자동 산출) | `MANUAL`(수동 시드). 누적수익률 단순비교 금지 — CAGR(롤링 20년)로만 비교.

### 인증·권한 (NextAuth v5 split-config)

- `src/auth.config.ts` = Edge-safe 최소 설정(JWT 세션). `src/proxy.ts`(Edge, PrismaAdapter 불가)가 이걸로 로그인 판정 → `/survey`·`/portfolio` 보호.
- `src/auth.ts` = Node 런타임. PrismaAdapter + Credentials(bcrypt, 자동가입 없음) + 선택적 Google. 가입은 `POST /api/auth/register`(정원 `MAX_SIGNUPS`, 기본 100).
- **관리자 게이팅**: DB 역할 컬럼 없음. `ADMIN_EMAILS` 환경변수 화이트리스트 → `isAdminEmail()`(`src/lib/admin.ts`). **보안 경계는 서버사이드**(admin API 라우트가 `isAdminEmail` 미충족 시 404 존재 은닉). `session.user.isAdmin`(JWT) 은 **UI 표시용일 뿐** 보안 경계가 아니다.

### 투자전략 플래너 (핵심 도메인)

`src/lib/portfolio.ts` 가 중심: `RiskType`(성향 5종), `BASE_ALLOCATION`(성향별 배분), `MAX_EQUITY_PCT=70`(퇴직연금 위험자산 한도 — 모든 배분 경로에서 클램프), `applySignals`(시장신호 반영), `buildEtfRecommendations`, `getClassCagrs`.
- `src/lib/target-allocation.ts` — 목표 수익률 역산기 `solveTargetAllocation`(순수 함수, 서버·클라 공유). 불변식: 합계 100·전항목≥0·equity≤70·(달성가능 시) 표시 기대수익 ≥ 목표. Vitest property 테스트로 검증.
- `src/lib/portfolio-response.ts` — `GET /api/portfolio` 와 `PUT/DELETE /api/portfolio/target` 이 공유하는 응답 빌더. **배분 모드**: `RISK_TYPE`(성향+신호, 기본) vs `TARGET`(목표 역산, 신호는 정보로만·배분 미적용). `RiskProfile.targetReturn` 이 모드를 가른다.
- `src/lib/etf-returns.ts` — `getEtfReturnMap()`(EtfReturn DB 조회, 실패 시 빈 맵 → 빌더가 `FALLBACK_ETF_RETURNS` 로 보강).

### PWA·아이콘

`src/app/_brand/compass.tsx` 가 나침반 아이콘 단일 소스(ImageResponse PNG 생성). `apple-icon.tsx`·`icons/*.png`(manifest용)·`icon.svg`(파비콘)·`favicon.ico`(`npm run gen:favicon`) 가 여기서 파생. 디자인 변경 시 compass.tsx 만 고치고 favicon 재생성.

## 배포 (Vercel)

- 운영 프로젝트: `investing-manager-kf7m` 단일, region `hnd1`(도쿄).
- **흐름**: 브랜치 생성 → 커밋 → PR → squash 머지(main) → 자동 배포. 직접 main 커밋하지 말 것.
- 빌드 커맨드(`vercel.json`): `prisma generate && prisma db push && next build` — **스키마 변경이 빌드 시 DB 에 반영**된다.
- 배포 확인: `npx vercel ls` / `npx vercel inspect <deployment-url> --wait`. 로그인 필요 페이지 검증은 e2e 시드 계정(`e2e-test@example.com`)으로 가능(dev·prod 동일 DB).

## 테스트 컨벤션

- **UI 변경은 추측 말고 Playwright 실제 렌더링으로 검증**하고 스크린샷 확인(데스크톱 + Pixel 5 모바일). `playwright.config.ts` 는 `setup` 프로젝트(로그인 → `e2e/.auth/session.json`)를 desktop·mobile 이 재사용하며 `reuseExistingServer: true`.
- 임시 검증 스펙/스크립트는 `_tmp*`·`tmp-*` 로 만들고 검증 후 삭제한다.
- `docs/` 에 PRD·기능 규격·설계서가 있다. 새 기능은 먼저 `docs/*-design.md` 로 설계 후 구현하는 흐름을 따른다.
