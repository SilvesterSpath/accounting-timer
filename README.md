# Accounting Workload & Profitability Management System

Gate A **practice prototype** (fictional data). See:

- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — full plan
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) — Phase 0 prototype assumptions

## Prerequisites

- **Node.js 24 LTS** (see `.nvmrc`)
- pnpm 10+ (`corepack enable`)
- Docker Desktop (Postgres)

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
pnpm db:up
```

## Phase 0 commands

```bash
pnpm check:node          # must be Node 24
pnpm db:up               # Postgres
pnpm --filter @accounting-timer/shared-types build
pnpm typecheck
pnpm test
pnpm verify:phase0       # API + Vite-proxied health
pnpm dev                 # API + web in parallel
```

- Web: http://127.0.0.1:5173 (proxies `/api` → API)
- API health: http://127.0.0.1:3001/api/v1/health

Desktop empty shell (optional): `pnpm dev:web` then `pnpm dev:desktop`.

## Scope note

Phase 0 is scaffold only. Do not load real employee/client data. Phase 1+ requires separate approval.
