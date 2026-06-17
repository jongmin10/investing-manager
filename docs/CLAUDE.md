# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

퇴직연금 경제지표 대시보드 웹서비스 — a Korean-language dashboard for DC/IRP retirement pension holders to monitor 10 key economic indicators and receive personalized portfolio recommendations. Target users are non-professional salaried workers who self-direct their retirement accounts.

All documentation lives in `docs/`. Source code has not been initialized yet.

## Development Commands

Once the Next.js project is initialized (`npx create-next-app@latest`), the standard commands will be:

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint check
npm test             # Jest test suite
npm test -- --testPathPattern=<file>  # Run a single test file
npx prisma migrate dev               # Apply DB migrations
npx prisma studio                    # Open DB GUI
```

## Architecture

Single Next.js 14 (App Router) monolith serving both frontend and backend API routes.

```
[Browser]
    ↓
[Next.js App — Frontend + API Routes]
    ↓              ↓
[PostgreSQL]   [Redis Cache]
    ↓
[node-cron Data Collector]
    ↓
[External APIs: 한국은행 / 통계청 / KRX / CBOE / etc.]
```

**Key design rule**: External APIs are never called during user requests. A background cron job pre-fetches all indicator data into PostgreSQL/Redis. Users always read from cache.

**Redis TTL strategy**: Real-time indicators (FX, KOSPI, S&P500, VIX) cache for 15 minutes; monthly indicators (CPI, PPI, unemployment, CLI) cache for 24 hours.

**Stack**: Next.js 14 + TypeScript + Tailwind CSS + Recharts | Prisma ORM + PostgreSQL (Supabase) + Redis (Upstash) | NextAuth.js (Phase 2) | node-cron | Jest + React Testing Library

**Deployment**: Vercel (app) + Supabase (PostgreSQL) + Upstash (Redis)

## The 10 Economic Indicators

| # | Indicator | Source | Frequency |
|---|-----------|--------|-----------|
| 1 | 기준금리 (BOK base rate) | 한국은행 Open API | Per MPC decision |
| 2 | 국고채 금리 3Y/10Y | 금융투자협회 | Daily |
| 3 | KOSPI / KOSDAQ | KRX | Real-time |
| 4 | S&P 500 | Public stock API | Real-time |
| 5 | CPI 소비자물가지수 | 통계청 | Monthly |
| 6 | PPI 생산자물가지수 | 통계청 | Monthly |
| 7 | KRW/USD 환율 | 서울외국환중개 | Real-time |
| 8 | 경기선행지수 CLI | 통계청 / OECD | Monthly |
| 9 | 실업률 | 통계청 | Monthly |
| 10 | VIX 공포지수 | CBOE | Real-time |

Anomaly thresholds that trigger card highlights: VIX > 30, CPI > 3%.

## Multi-Agent Development Workflow

Development uses a coordinated agent model. Agent 0 (PM) runs first each session to assess state and assign work.

**Phase 1 execution order**: 0 → 1 → 2 + 3 (parallel) → 4 + 5 (parallel) → 7 → 8

| Agent | Responsibility | Prerequisite |
|-------|---------------|--------------|
| 0 PM | Coordination, task assignment, quality gates | — |
| 1 DB | Prisma schema, migrations, seed data | None (runs first) |
| 2 Collector | External API integration, cron scheduling, Redis TTL | Agent 1 |
| 3 Backend | Next.js API routes, response specs, portfolio logic | Agent 1 (parallel with 2) |
| 4 UI | Dashboard layout, indicator cards, survey UI, responsive | Agent 3 spec done |
| 5 Charts | Recharts components, data transformation | Agent 3 spec done (parallel with 4) |
| 6 Auth | NextAuth.js, Google/Kakao social login, session middleware | Agent 4 base done |
| 7 Testing | Unit + integration tests, regression before phase transition | Phase features done |
| 8 Deploy | Vercel/Supabase/Upstash setup, GitHub Actions CI/CD, env vars | Agent 7 passes |

## Phase Roadmap

- **Phase 1 (MVP)**: Public dashboard (no login) — 10 indicator cards with trend charts, economic glossary
- **Phase 2**: Login required — investor risk profile survey (5–7 questions → 5 types), portfolio allocation recommendations, rebalancing signals
- **Phase 3**: Personalization — indicator alerts (web push / email), economic calendar (FOMC, MPC dates), manual return tracker

## Mandatory UI Requirement

Every page must display the disclaimer: "투자 참고용 정보이며 투자 결과에 책임지지 않음" (information for reference only; no liability for investment outcomes). This is a Korean financial regulation requirement.
