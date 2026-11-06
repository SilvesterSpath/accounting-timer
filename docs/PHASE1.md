# Phase 1 — Vertical slice

Branch: `feature/phase-1` (from `experiment/electron-poc`)

## Objective

Mock CRM → select client → create time entry → persist → daily/monthly totals, with server-side authz and transactional audit.

## Demo users

Password for all: `Password123!`

| Email | Role |
|-------|------|
| `employee@example.com` | employee |
| `manager@example.com` | manager |
| `admin@example.com` | admin (CRM sync) |
| `disabled@example.com` | employee, inactive |

## Run

```bash
pnpm db:up
pnpm --filter @accounting-timer/api db:seed   # also runs on API start
pnpm dev:api
pnpm dev:web
```

- Sign in: http://localhost:5173/login  
- Workbench: http://localhost:5173/app  

## Acceptance

| Criterion | Coverage |
|-----------|----------|
| End-to-end fictional path behind proxy | UI workbench + API integration test |
| Employee cannot read others’ entries | `phase1.integration.test.ts` |
| Audit row on insert | same + `audit_logs` |
| Disabled user rejected on next API call | same |
| Duration + month boundary units | `duration.test.ts` |
| Cookie refresh Origin check | integration test |

## Out of scope (later phases)

Import pipeline, monthly CSV file export, Electron login/safeStorage smoke (Phase 2), signed installers.
