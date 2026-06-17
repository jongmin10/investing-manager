# 시스템 아키텍처 — 퇴직연금 경제지표 대시보드

**버전** 0.1 | **작성일** 2026-06-17

---

## 1. 전체 구조

```
[사용자 브라우저]
      ↓
[Next.js 앱 (Frontend + API Routes)]
      ↓              ↓
[PostgreSQL]      [Redis Cache]
      ↓
[Data Collector (Node.js Cron)]
      ↓
[외부 API: 한국은행 / 통계청 / KRX / CBOE 등]
```

Next.js 단일 앱으로 프론트엔드와 백엔드 API를 함께 운영한다.
외부 API 데이터는 별도 수집기가 주기적으로 가져와 DB/캐시에 저장해두고, 사용자는 항상 빠른 응답을 받는다.

---

## 2. 기술 스택

### Frontend
| 항목 | 기술 | 선택 이유 |
|------|------|----------|
| 프레임워크 | Next.js 14 (App Router) | SSR/SSG로 초기 로딩 빠름, SEO 대응 |
| 언어 | TypeScript | 타입 안전성, 유지보수성 향상 |
| 스타일 | Tailwind CSS | 빠른 UI 개발 |
| 차트 | Recharts | React 친화적, 커스터마이징 용이 |

### Backend (Next.js API Routes)
| 항목 | 기술 | 선택 이유 |
|------|------|----------|
| ORM | Prisma | DB 스키마 관리, 마이그레이션 자동화 |
| 인증 | NextAuth.js | Phase 2 로그인, 소셜 로그인 포함 |
| 스케줄러 | node-cron | 외부 API 주기적 수집 |

### 데이터 저장
| 항목 | 기술 | 용도 |
|------|------|------|
| RDBMS | PostgreSQL | 사용자 정보, 설문 결과, 알림 설정 |
| Cache | Redis | 실시간 지표 캐싱, API 중복 호출 방지 |

### 배포 인프라
| 항목 | 서비스 | 비고 |
|------|--------|------|
| 앱 호스팅 | Vercel | Next.js 최적화, 자동 CI/CD |
| DB 호스팅 | Supabase | PostgreSQL + 관리 콘솔 |
| Redis 호스팅 | Upstash | Serverless Redis, Vercel 연동 최적 |

---

## 3. 성능·유지보수 설계 원칙

- **외부 API 직접 호출 금지**: 수집기가 미리 DB에 저장 → 사용자 응답 속도 일정하게 유지
- **Redis TTL 전략**: 실시간 지표(환율·주가) 15분, 월별 지표(CPI·실업률) 24시간 캐싱
- **Prisma 마이그레이션**: DB 스키마 변경 이력 관리, 안전한 단독 운영 가능
- **Phase별 모듈 분리**: Phase 2·3 추가 시 기존 코드 영향 최소화

---

## 4. 개발 도구

| 목적 | 도구 |
|------|------|
| 코드 에디터 | VS Code |
| 버전 관리 | Git + GitHub |
| AI 코딩 | Claude Code |
| 코드 품질 | ESLint + Prettier |
| 테스트 | Jest + React Testing Library |
| API 테스트 | Thunder Client (VS Code 확장) |
| DB 관리 | Prisma Studio |
