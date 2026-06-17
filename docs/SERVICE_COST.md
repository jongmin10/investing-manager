# 서비스 비용 검토

**버전** 0.1 | **작성일** 2026-06-17

---

## 1. 유료 전환 가능 서비스

### Vercel
- **Hobby (무료)**: 개인 비상업용만 허용. 상업 서비스로 전환 시 Pro 필요
- **Pro**: $20/인/월
- **판단**: Phase 1 개발·테스트는 Hobby로 충분. 서비스 오픈 시 Pro 전환 필요

### Supabase
- **Free**: 500MB DB, 프로젝트 비활성 7일 후 자동 정지 → 운영 환경에 부적합
- **Pro**: $25/프로젝트/월
- **판단**: 개발 중에는 Free, 운영 배포 시 Pro 필요

### Upstash (Redis)
- **Free**: 월 500K 커맨드 무료
- **Pay-as-you-go**: 10만 커맨드당 $0.20
- **판단**: 초기 트래픽 수준에서는 Free로 충분. 사용자 증가 시 과금

---

## 2. 무료 서비스 (전체)

Next.js, TypeScript, Tailwind CSS, Recharts, Prisma, NextAuth.js, node-cron, PostgreSQL(자체 설치 시), VS Code, Git/GitHub, ESLint, Prettier, Jest, Thunder Client, Prisma Studio

---

## 3. 비용 시나리오

| 단계 | 월 비용 | 비고 |
|------|--------|------|
| 개발·테스트 | **$0** | Vercel Hobby + Supabase Free + Upstash Free |
| 서비스 오픈 | **$45~50/월** | Vercel Pro $20 + Supabase Pro $25 + Upstash 소액 |

---

## 4. 주의사항

Supabase Free의 **비활성 7일 자동 정지**가 가장 주의할 점이다.
개발 단계에서 수시 접속이 필요하면 초반부터 Pro를 고려하거나, 개발용은 로컬 PostgreSQL을 사용하는 것을 권장한다.

---

## 5. 참고 링크

- [Vercel Pricing](https://costbench.com/software/developer-tools/vercel/)
- [Supabase Pricing](https://comparedge.com/tools/supabase/pricing)
- [Upstash Redis Pricing](https://upstash.com/pricing/redis)
