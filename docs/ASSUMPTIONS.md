# Gate A — Prototype assumptions

Documented for Phase 0 per [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md). These are **practice-prototype choices**, not client-confirmed production requirements. Gate B (real data / client pilot) remains blocked until discovery and privacy prerequisites are met.

## Delivery gates

| Gate | Scope |
|------|--------|
| **A — Practice prototype** | Fictional/synthetic data only; local solo development |
| **B — Client pilot** | Requires CRM/identity/hosting/privacy answers before any real employee or client data |

## Permissions matrix (prototype default)

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| Create/edit/delete own time entries | Yes | Yes | Yes |
| View own daily/weekly | Yes | Yes | Yes |
| View/edit others’ entries | No | Yes | Yes |
| Management reports / CSV export | No | Yes | Yes |
| Historical import / audit / CRM sync | No | No | Yes |
| Manage users, activities, employees, local client fields | No | No | Yes |

Server-side RBAC only. UI may hide controls but never authorizes.

## Reporting contract

- Business date: `work_date`; timestamps derived via **Europe/Budapest** when needed
- Month filter: inclusive `YYYY-MM-01`, exclusive next month
- Aggregate **integer minutes**; display hours are presentation-only
- Open reports: `is_current = true AND deleted_at IS NULL` (no double-count of superseded rows)
- Screen and CSV share one aggregation service (CSV implemented in a later phase)

## Import identity (current-version)

- Prefer `source_system` + `source_record_id`
- Partial unique: current, non-deleted rows only (`is_current = true`)
- Correction order (atomic): lock current → mark non-current → insert replacement → link supersession → audit → commit
- Unchanged reimport → no-op; manual-edit conflicts → review, never silent overwrite
- Frozen `preview_id` at commit; stale preview rejected; recommit idempotent

## Authentication (Gate A)

- **Browser:** same-origin Vite/API (or reverse) proxy; access JWT in memory; refresh in httpOnly cookie; Origin/CSRF checks on cookie endpoints
- **Electron:** refresh via JSON body + `safeStorage`; not inferred from `appMode`
- `appMode` is transport/config only — never bypasses authn/authz
- Reject requests that send both cookie and body refresh tokens
- Multi-tab: BroadcastChannel coordinator (localStorage fallback); reuse after rotation revokes family only
- Server `refresh_sessions`: hashed token, expiry, family id, revocation, user id
- Disabled users rejected on every authenticated API request

## Electron (Gate A / early smoke later)

- Constrained custom protocol `app://` serving Vite `dist` only (Phase 2 smoke)
- `webSecurity: true`; required CSP; contextIsolation; no nodeIntegration; sandbox where supported
- Phase 0 desktop package is an empty shell only (dev load of web URL acceptable)

## Stack pins

- Node.js **24 LTS** (`engines`, `.nvmrc`, CI)
- React + TypeScript + Vite + Tailwind (one UI)
- Node/TS REST API (Fastify), PostgreSQL + Drizzle (schema in later phases)
- Docker Compose for Postgres only
- pnpm workspaces; `packages/shared-types` only for now

## Explicitly out of Gate A

Real CRM, fees/cost/profitability, legal working-time compliance, offline sync, signed installers/auto-update, completeness/productivity rankings, microservices/Redis/queues.

## Historical samples

None available in-repo at Phase 0 (non-blocking). Synthetic samples come with the import phase.
