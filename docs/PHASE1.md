# Phase 1 — Vertical slice

Branch: `feature/phase-1` (from `experiment/electron-poc`)

## Objective

Mock CRM → select client → create time entry → persist → daily/monthly totals, with server-side authz and transactional audit.

## Demo users

Password for all **new** demo users: `Password123!`

| Email | Role |
|-------|------|
| `employee@example.com` | employee |
| `employee-b@example.com` | employee |
| `manager@example.com` | manager |
| `admin@example.com` | admin (CRM sync) |
| `disabled@example.com` | employee, inactive |

### Timesheet access groups vs persisted roles

The product talks about two **timesheet access levels**:

- **Employee** — own timesheet only (`employee` role)
- **Operator** — inspect/manage others’ timesheets (`manager` and `admin` roles)

These are access groupings for timesheet visibility, **not** additional persisted roles. The database still stores exactly three roles: `employee`, `manager`, and `admin`. Admin retains CRM sync; manager does not.

Demo seeding is **explicit only** (`pnpm db:seed:demo`). API startup applies migrations but does **not** re-seed. Re-running demo seed never overwrites existing users’ password, role, or active flag.

## Run

```bash
pnpm db:up                 # starts app DB :5432 and test DB :5433
pnpm db:seed:demo          # once, development only
pnpm dev:api
pnpm dev:web
```

- Sign in: http://localhost:5173/login  
- Workbench: http://localhost:5173/app  

Workbench day/month defaults use **Europe/Budapest**.

## Security notes (remediation)

- Production requires `JWT_SECRET` (no hardcoded production fallback)
- Login throttling: per-IP and per-account failure windows
- Refresh rotation is transactional; concurrent reuse → one winner, family revoke
- Replay of a rotated refresh token **commits** family revocation before HTTP 401 (successor invalidated)
- Cookie-based refresh **and** logout require trusted `Origin`
- Destructive integration tests require isolated DB only (`127.0.0.1:5433` / `accounting_timer_test`)
- Browser tabs coordinate refresh via BroadcastChannel (same-tab in-flight dedupe)

## Acceptance

| Criterion | Coverage |
|-----------|----------|
| End-to-end fictional path behind proxy | UI workbench + API integration test |
| Employee cannot read others’ entries | `phase1.integration.test.ts` |
| Audit row on insert | same + `audit_logs` |
| Disabled user rejected on next API call | same |
| Duration + month boundary units | `duration.test.ts` |
| Budapest UI date defaults | `budapestDate.test.ts` |
| Cookie Origin on refresh/logout | integration test |
| Concurrent refresh | integration test |
| Login throttle | `loginThrottle.test.ts` |

Integration tests use **only** `TEST_DATABASE_URL` (default `:5433` / `accounting_timer_test`), never the development database.

## Out of scope (later phases)

Import pipeline, monthly CSV file export, signed installers. Electron login/safeStorage smoke → `docs/PHASE2.md`.
