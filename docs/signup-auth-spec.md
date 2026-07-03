# 신규 사용자 회원가입 절차 도입 — 규격서

> 상태: **규격 확정 (구현 대기)** · 작성 2026-07-03 · 확정 2026-07-03
> 작성 배경: 관리자 계정용 공유 비밀번호(`AUTH_LOGIN_PASSWORD`) 게이트 도입(PR #20) 이후 **신규 사용자 로그인 절차가 누락**되어 발생한 로그인 불가 문제
> **확정 결정**: ① 공유 비밀번호 → **사용자별 이메일 + 개인 비밀번호(bcrypt 해시)**  ② 가입은 **초대제(invite-only)**  ③ 기존 계정 마이그레이션 = **셀프 클레임(A) + 관리자 부트스트랩(B)**

---

## 1. 배경 및 문제 정의

### 1.1 현재 동작 (문제)
- `src/auth.ts`의 Credentials `authorize`는 **로그인 시점에 사용자를 자동 생성**한다(이메일만으로 `prisma.user.create`).
- PR #20에서 프로덕션 무인증 로그인을 막기 위해 **공유 비밀번호 게이트**를 추가:
  ```ts
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.AUTH_LOGIN_PASSWORD;
    if (!expected) return null;                    // fail-closed
    if (credentials.password !== expected) return null;
  }
  ```
- 결과: **신규 사용자는 공유 비밀번호를 모르면 로그인 불가**. 세션이 JWT라 이미 쿠키를 가진 운영자 본인은 영향이 없어 "신규 사용자만 로그인 안 됨"으로 나타남.
- 근본 원인: 이 게이트는 **관리자 1인 접근 통제** 목적이었을 뿐, **신규 사용자의 가입/인증 절차를 설계하지 않았다**.

### 1.2 변경 목표
- 공유 비밀번호를 폐기하고 **사용자별 개인 비밀번호(해시)** 로 전환한다.
- 신규 사용자는 **관리자 초대(초대 토큰)** 를 받아 **`이메일/비밀번호`로 회원가입 → 로그인** 한다.
- `authorize`는 더 이상 사용자를 **자동 생성하지 않는다**(존재하는 계정의 비밀번호 검증만).

### 1.3 비목표 (이번 범위 제외)
- 이메일 인증(verification) 메일 발송, 비밀번호 재설정(찾기) 메일 플로우 → **후속 페이즈**.
- 소셜 로그인(Google) 회원가입 정책 변경 → 기존 그대로 유지(존재 시 활성화).
- 다단계 인증(MFA), CAPTCHA → 이번 제외.

---

## 2. 요구사항

### 2.1 기능 요구사항
| # | 요구사항 |
|---|----------|
| F1 | 신규 사용자는 **유효한 초대 토큰**이 있어야 `/signup`에서 **이메일·이름·비밀번호·비밀번호 확인**으로 계정을 생성한다. |
| F2 | 로그인은 `/login`에서 **이메일 + 개인 비밀번호**로만 수행한다(공유 비밀번호 폐기). |
| F3 | 비밀번호는 평문 저장 금지 — **해시(bcrypt)** 로만 저장한다. |
| F4 | 중복 이메일 가입은 거부한다(이미 가입된 이메일 안내). |
| F5 | `authorize`는 존재하는 사용자의 비밀번호만 검증하고, **자동 생성하지 않는다**. |
| F6 | 기존(비밀번호 미설정) 사용자의 로그인 연속성 보장(§6: 셀프 클레임 + 관리자 부트스트랩). |
| F7 | 관리자 권한은 기존 `ADMIN_EMAILS` 화이트리스트 방식을 그대로 유지한다. |
| F8 | 관리자는 `/admin`에서 **초대를 발급/조회/폐기**할 수 있다(초대 링크·토큰 생성). |

### 2.2 비기능 요구사항
- **보안**: 사용자 열거(user enumeration) 방지 — 로그인 실패 메시지는 원인 불문 동일. fail-closed 유지. 초대 토큰은 추측 불가한 난수.
- **서버리스 호환**: 해시 라이브러리는 Vercel 서버리스에서 네이티브 바인딩 이슈가 없는 순수 JS 구현 사용.
- **모바일 반응형**: `/signup`·`/login` 실측 검증(프로젝트 원칙: Playwright).

---

## 3. 데이터 모델 변경 (Prisma)

### 3.1 User — 비밀번호 해시 컬럼 추가
`passwordHash`는 **nullable** — 소셜 로그인 사용자 및 기존 사용자는 값이 없을 수 있다.

```prisma
model User {
  // ... 기존 필드 유지 ...
  passwordHash  String?   // bcrypt 해시. Credentials 가입자만 보유. OAuth/기존유저는 null.
}
```

### 3.2 Invitation — 초대 (신규)
```prisma
model Invitation {
  id           String    @id @default(cuid())
  token        String    @unique              // 초대 링크 토큰(추측 불가 난수, 32바이트 base64url)
  email        String?                         // 특정 이메일 지정 초대(선택). null이면 토큰만으로 가입.
  createdBy    String                          // 발급 관리자 이메일
  createdAt    DateTime  @default(now())
  expiresAt    DateTime?                        // 만료(선택, 기본 7일)
  usedAt       DateTime?                        // 1회용 소진 시각
  usedByUserId String?                          // 소진한 사용자 id

  @@index([email])
}
```
- **1회용**: `usedAt`이 채워지면 재사용 불가. `email` 지정 시 해당 이메일로만 소진 가능.
- 적용: 라이브는 Supabase Postgres → **`prisma db push`** (memory: db-is-postgres-not-sqlite; 마이그레이션 폴더 미사용).
- `passwordHash`·`Invitation.token`은 **필요 범위 밖으로 반환 금지**(select 제외, 응답 직렬화 배제. 토큰은 발급 응답에서만 1회 노출).

---

## 4. 비밀번호 해싱

- **라이브러리**: `bcryptjs`(순수 JS) 채택. 네이티브 `bcrypt`는 Vercel 빌드/런타임 바인딩 이슈 가능성 → 회피.
  ```bash
  npm i bcryptjs && npm i -D @types/bcryptjs
  ```
- **비용(cost) 팩터**: 10 (서버리스 응답시간과 보안의 균형).
- 신규 헬퍼 `src/lib/password.ts`:
  ```ts
  import bcrypt from "bcryptjs";
  const COST = 10;
  export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
  export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
  ```
- **정책(확정)**: 최소 **8자**, 최대 72자(bcrypt 바이트 한계), 공백만으로 구성 금지. 문자 종류 강제(대소문자·숫자·기호)는 두지 않음(길이 중심).

---

## 5. 인증 흐름 변경

### 5.1 회원가입 API — `POST /api/auth/register` (신규)
요청: `{ email, name, password, invite }` (`invite` = 초대 토큰)

처리 순서:
1. 입력 검증 — 이메일 형식, 비밀번호 정책(§4). 이름 비면 이메일 local-part로 대체.
2. **기존 사용자 조회**(`findUnique({ email })`):
   - 존재 + `passwordHash != null` → **409 이미 가입된 이메일**.
   - 존재 + `passwordHash == null` → **셀프 클레임(A)**: 초대 없이 `passwordHash` 설정으로 계정 이어받기(§6). *(기존 신뢰 계정 한정)*
   - 미존재 → **초대 검증(3)** 후 신규 생성.
3. **초대 검증(신규 계정에 한함)**:
   - `invite` 토큰 존재 + `usedAt == null` + (`expiresAt` 미도래) 확인. 실패 시 **403 유효하지 않은 초대**.
   - `Invitation.email`이 지정돼 있으면 요청 `email`과 일치해야 함.
   - 통과 시 `create({ email, name, passwordHash })` 후 **같은 트랜잭션에서** `Invitation`을 `usedAt`·`usedByUserId`로 소진.
4. 성공 시 **201**. 이후 클라이언트가 `signIn("credentials")`로 **즉시 로그인**(가입 직후 자동 로그인).
5. 보안: 레이트리밋(IP/이메일 기준), 응답에 `passwordHash`·토큰 미포함.

### 5.2 초대 관리 API — `/api/admin/invitations` (신규, `isAdminEmail` 가드)
| 메서드·경로 | 동작 |
|-------------|------|
| `POST /api/admin/invitations` | `{ email?, expiresInDays? }` → 초대 생성, **초대 링크(`/signup?invite=<token>`) 1회 반환**. |
| `GET /api/admin/invitations` | 발급 초대 목록(상태: 미사용/사용/만료). 토큰 원문은 마스킹. |
| `DELETE /api/admin/invitations/:id` | 미사용 초대 폐기(만료 처리). |

- 비관리자 접근 시 **404**(기존 admin 라우트 패턴, 존재 은닉).

### 5.3 로그인 — `authorize` 재작성 (`src/auth.ts`)
```ts
async authorize(credentials) {
  if (!credentials?.email || !credentials?.password) return null;
  const email = credentials.email as string;

  const user = await prisma.user.findUnique({ where: { email } });
  // 사용자 없음 / 비밀번호 미설정 계정 → 로그인 거부(자동 생성 안 함)
  if (!user || !user.passwordHash) return null;

  const ok = await verifyPassword(credentials.password as string, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, email: user.email, name: user.name };
}
```
- **제거**: 공유 비밀번호 게이트(`AUTH_LOGIN_PASSWORD`) 및 `NODE_ENV === "production"` 분기.
- **제거**: `authorize` 내 `prisma.user.create` 자동 가입.
- `events.signIn`(lastLoginAt·loginCount), `jwt`/`session` 콜백, JWT 세션 전략은 **그대로 유지**.
- 로컬 개발도 실제 가입/비밀번호 필요 — seed로 테스트 계정 1개 제공(§9).

### 5.4 UI 변경
| 화면 | 변경 |
|------|------|
| `/login` | 비밀번호 필드를 **필수**로 명확화("(운영 환경)" 문구 제거), "초대를 받으셨나요? **회원가입**" 링크(`/signup`) 추가. 실패 메시지는 열거 방지형 단일 문구 유지. |
| `/signup` (신규) | `?invite=<token>` 쿼리로 진입. 이메일·이름·비밀번호·비밀번호 확인 폼 → `POST /api/auth/register` → 성공 시 즉시 `signIn` → `/portfolio`. 초대 토큰 없거나 무효면 안내(가입 차단). 클라이언트 검증 + 서버 검증 이중화. |
| `/admin` 초대 섹션 | 초대 발급 버튼(+ 이메일 지정 옵션)·발급된 링크 복사·초대 목록/상태. 관리자에게만 노출(`isAdminEmail`). |

---

## 6. 기존 사용자 마이그레이션 (확정: A + B)

현재 DB에는 구(舊) 자동가입 방식의 **`passwordHash == null` 사용자**(운영자 포함)가 존재한다. 변경 후 비밀번호가 없어 로그인 불가해지므로:

- **(A) 셀프 클레임** — `/signup`에서 **기존 이메일 + 새 비밀번호** 입력 시, `passwordHash == null`이면 **초대 없이** 비밀번호를 설정해 계정을 이어받는다. 이미 등록된 신뢰 계정에 한함. (신규 이메일은 초대 필수 — §5.1.)
- **(B) 관리자 부트스트랩** — 운영자 계정은 **env/스크립트로 최초 비밀번호를 주입**해 확실히 확보한다. 로그인 절차 전환 **이전에 선행**(자기 잠금 방지).
  - 스크립트 `scripts/bootstrap-admin.mjs`: `ADMIN_BOOTSTRAP_EMAIL`·`ADMIN_BOOTSTRAP_PASSWORD` env를 읽어 해당 유저의 `passwordHash` 설정(없으면 생성).

> 셀프 클레임(A)은 "이메일만 알면 클레임 가능"한 신뢰 경계를 가진다. 대상이 소수 기존 사용자로 한정되고 마이그레이션 창이 짧으므로 수용한다. 창 종료 후에는 남은 무(無)비밀번호 계정 정리를 검토한다.

---

## 7. 삭제·정리 대상

- 코드: `authorize`의 공유 비밀번호 분기 및 자동 `user.create`.
- 환경변수: `AUTH_LOGIN_PASSWORD` — **폐기**. Vercel/`.env`에서 제거(배포 순서 §8 준수).
- 문서: `.env.example`에 `AUTH_LOGIN_PASSWORD`가 없던 점(문서화 누락)이 이번 문제의 한 원인 → `.env.example`을 신규 절차 기준으로 갱신(`ADMIN_BOOTSTRAP_*` 등 신규 env 반영).

---

## 8. 배포 순서 (무중단 · 자기 잠금 방지)

1. `bcryptjs` 의존성 추가 + `passwordHash`·`Invitation` `prisma db push`(nullable/신규 테이블이라 기존 데이터 안전).
2. `/api/auth/register` + `/signup` + `/api/admin/invitations` + 어드민 초대 UI 배포(로그인은 아직 구 게이트 유지 가능).
3. **운영자 비밀번호 부트스트랩(§6-B) 실행** — 로그인 전환 전에 반드시 선행.
4. `authorize` 신규 로직 배포(공유 비밀번호 게이트 제거).
5. Vercel에서 `AUTH_LOGIN_PASSWORD` 제거.
6. 검증 후 기존 사용자에게 셀프 클레임(A) 안내, 신규는 초대 발급.

> ⚠️ 순서 3을 건너뛰면 운영자 쿠키 만료 시 재로그인 불가. **부트스트랩 선행 필수.**

---

## 9. 확정 결정 요약

| 항목 | 결정 |
|------|------|
| 가입 개방 정책 | **초대제(invite-only)** — DB에 없는 이메일은 유효 초대 토큰 필수 |
| 기존 계정 마이그레이션 | **A(셀프 클레임) + B(관리자 부트스트랩)** |
| 가입 직후 | **즉시 자동 로그인** |
| 비밀번호 강도 | 최소 8자(문자종류 강제 없음) |
| 초대 형태 | 1회용 토큰 링크(`/signup?invite=`), 선택적 이메일 지정·만료(기본 7일) |
| 비밀번호 재설정(찾기) | 이번 **범위 제외**(후속) |
| 로컬 개발 | seed 테스트 계정 1개 제공 |

---

## 10. 진행 순서 (제안)

1. **super** — `passwordHash`·`Invitation` 모델 + `db push`, `src/lib/password.ts`, `POST /api/auth/register`(초대 검증·셀프 클레임 포함), `/api/admin/invitations` CRUD, `authorize` 재작성, `bcryptjs` 도입, `scripts/bootstrap-admin.mjs`, seed 테스트 계정.
2. **wonder** — `/signup`(초대 토큰 진입) 페이지 + `/login` 문구/링크 개편 + `/admin` 초대 발급/목록 UI(반응형·접근성, Playwright 실측).
3. **sam** — 초대검증(무효/만료/1회용)·중복이메일·약비밀번호·열거방지·셀프클레임(A)·부트스트랩(B)·로그인 연속성·비관리자 404 QA + E2E(`e2e/auth.setup.ts`) 갱신.

> 배포 의존성: `bcryptjs` 설치, `prisma db push`(passwordHash·Invitation), 운영자 부트스트랩 선행, `AUTH_LOGIN_PASSWORD` 제거, `.env.example` 갱신(`ADMIN_BOOTSTRAP_*`).

---

## 11. 구현 후 변경 (2026-07-03)

구현·로컬 검증 중 운영 판단으로 다음을 조정함(§1~10은 초기 설계 기준).

1. **초대제 → 개방 가입으로 완화.** `POST /api/auth/register`에서 신규 이메일에 초대 토큰을 **필수 → 선택**으로 변경. 초대 토큰이 오면 검증·1회 소진(기존 로직 유지), 없으면 그대로 계정 생성. `/signup`은 초대 없이도 가입 가능하며, 초대 링크로 오면 안내 배너만 표시. `Invitation` 모델·`/admin/invitations` 발급 UI는 그대로 유지(선택적 초대·이메일 지정용).

2. **미들웨어 → `src/proxy.ts` 마이그레이션 (Next.js 16).** Next 16이 `middleware` 규약을 deprecate(→`proxy`)하여 기존 루트 `middleware.ts`가 무시됨 → 보호 경로(`/portfolio`·`/survey`) 리다이렉트가 동작하지 않아 로그인 페이지가 뜨지 않던 문제. `src/proxy.ts`로 이전해 해결. Edge 런타임 제약(PrismaAdapter 불가, `adapterFn is not a function`)은 **split-config**로 해결 — 어댑터 없는 `src/auth.config.ts`를 신설해 `auth.ts`(Node)는 `...authConfig`+adapter+providers, `proxy.ts`(Edge)는 `NextAuth(authConfig)`의 `auth`만 사용해 JWT 세션 판정.
