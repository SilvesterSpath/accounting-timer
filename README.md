# Accounting Workload & Profitability Management System

Gate A **practice prototype** (fictional data). See:

- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — full plan
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) — Phase 0 prototype assumptions
- [docs/ELECTRON_POC.md](docs/ELECTRON_POC.md) — Phase 0.5 Electron feasibility (`experiment/electron-poc`)
- [docs/PHASE1.md](docs/PHASE1.md) — Phase 1 vertical slice (`feature/phase-1`)
- [docs/RAILWAY_DEMO.md](docs/RAILWAY_DEMO.md) — browser-only Railway demo (no Electron)

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

## Electron PoC (Phase 0.5)

```bash
pnpm db:up
pnpm dev:api
pnpm package:desktop
pnpm verify:electron-poc
pnpm verify:electron-poc:package
pnpm --filter @accounting-timer/desktop start:packaged
```

Canonical desktop origin: `app://accounting-timer`.  
Packaged GUI acceptance is a **manual checklist** in [docs/ELECTRON_POC.md](docs/ELECTRON_POC.md).

Optional Electron against Vite (**unpackaged only**; ignored when packaged):

```bash
pnpm dev:web
# PowerShell:
# $env:ELECTRON_START_URL="http://127.0.0.1:5173"
pnpm dev:desktop
```


## Phase 1 (vertical slice)

```bash
pnpm db:up
pnpm db:seed:demo    # explicit; does not run on API start; never overwrites existing users
pnpm dev
# http://localhost:5173/login  — employee@example.com / Password123!
# Admin CRM sync from /app after signing in as admin@example.com
```

## Railway demo image (local smoke)

```bash
pnpm docker:smoke   # build Dockerfile; empty DB migrate+bootstrap+ready
```

See [docs/RAILWAY_DEMO.md](docs/RAILWAY_DEMO.md). Do not deploy until hosted HTTPS acceptance is complete.

## Scope note

Gate A uses fictional/synthetic data only. Do not load real employee/client data.
