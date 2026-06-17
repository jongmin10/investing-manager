# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

퇴직연금 경제지표 대시보드 웹서비스 — a Korean-language dashboard for DC/IRP retirement pension holders to monitor 10 key economic indicators and receive personalized portfolio recommendations. Target users are non-professional salaried workers who self-direct their retirement accounts.

Documentation lives in `docs/`. Source code is in `src/`.

## Development Commands

```bash
npm run dev              # Start development server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint check
npm run db:seed          # Re-seed the database with sample data
npx prisma migrate dev   # Apply DB migrations (creates migration files)
npx prisma studio        # Open DB GUI
npx tsc --noEmit         # TypeScript type check
```

## Tech Stack (Actual)

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts v3
- **ORM**: Prisma v5 + SQLite (local dev) → PostgreSQL (production)
- **Runtime**: Node.js

## Architecture

Single Next.js monolith (frontend + API routes). Data flow for Phase 1:

```
[Browser]
    ↓
[Next.js App — Server Components + API Routes]
    ↓
[Prisma ORM → SQLite (dev) / PostgreSQL (prod)]
```

**Key design rule**: External APIs are never called during user requests. In production, a background cron job pre-fetches all indicator data into the DB. In dev, `prisma/seed.ts` generates 3 years of synthetic data.

**Redis TTL strategy** (Phase 1 uses DB directly; Redis added in production): Real-time indicators 15 min, monthly indicators 24h.

## File Structure

```
src/
  app/
    page.tsx              # Dashboard (server component, reads DB directly)
    layout.tsx            # Root layout with header, footer, disclaimer
    globals.css
    api/
      indicators/
        route.ts                   # GET /api/indicators — all latest values
        [type]/history/route.ts    # GET /api/indicators/:type/history?period=1m|3m|1y|3y
    glossary/
      page.tsx            # Economics glossary page
  components/
    IndicatorCard.tsx     # Card with value, change, mini chart, glossary tooltip
    TrendChart.tsx        # Recharts line chart (mini and full variants)
    Disclaimer.tsx        # Mandatory legal disclaimer footer
  lib/
    prisma.ts             # PrismaClient singleton
    indicators.ts         # INDICATORS metadata map, IndicatorType, formatValue, isAnomaly
prisma/
  schema.prisma           # DB schema (IndicatorRecord, User, RiskProfile, AlertSetting)
  seed.ts                 # Synthetic data generator (Ornstein-Uhlenbeck mean-reverting)
  dev.db                  # SQLite database (gitignored)
docs/                     # All planning documents
```

## Indicator Types

Defined in `src/lib/indicators.ts` as `IndicatorType` union:
`BOK_BASE_RATE | GOV_BOND_3Y | GOV_BOND_10Y | KOSPI | KOSDAQ | SP500 | CPI | PPI | KRW_USD | CLI | UNEMPLOYMENT | VIX`

Each has metadata in `INDICATORS` map: name, unit, source, frequency, description (tooltip), glossary text, anomalyThreshold.

Anomaly thresholds: **VIX ≥ 30** and **CPI ≥ 3%** trigger red card highlight.

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

## Phase Roadmap

- **Phase 1 (MVP — current)**: Public dashboard (no login) — 10 indicator cards with trend charts, economic glossary
- **Phase 2**: Login required — investor risk profile survey, portfolio allocation recommendations, rebalancing signals
- **Phase 3**: Personalization — indicator alerts (web push/email), economic calendar, manual return tracker

## Multi-Agent Development Workflow

| Agent | Responsibility | Status |
|-------|---------------|--------|
| 0 PM | Coordination, task assignment | — |
| 1 DB | Prisma schema, migrations, seed data | ✅ Done |
| 2 Collector | External API integration, cron scheduling | Pending |
| 3 Backend | Next.js API routes | ✅ Done (Phase 1) |
| 4 UI | Dashboard layout, indicator cards | ✅ Done (Phase 1) |
| 5 Charts | Recharts components | ✅ Done (Phase 1) |
| 6 Auth | NextAuth.js (Phase 2) | Pending |
| 7 Testing | Unit + integration tests | Pending |
| 8 Deploy | Vercel/Supabase/Upstash setup | Pending |

## Mandatory UI Requirement

Every page must display the disclaimer component (`<Disclaimer />`): "투자 참고용 정보이며 투자 결과에 책임지지 않음". This is a Korean financial regulation requirement — never remove it.
