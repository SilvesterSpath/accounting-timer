# Phase 2 — Packaged Electron compatibility smoke

Branch: `feature/phase-2` (from `feature/phase-1`)

## Objective

Prove the same React UI build works in a **packaged** Electron app: login, navigate, create a time entry against the shared API, and save the PoC fixture file. No monthly CSV; no signed installer.

## Auth transport (T03)

| Client | Refresh transport |
|--------|-------------------|
| Browser / Vite | httpOnly cookie only — refresh token never in JSON body |
| Packaged Electron (`Origin: app://accounting-timer`) | refresh token in JSON body; stored via OS `safeStorage` through preload IPC |

- Ambiguous requests (cookie **and** body refresh) → **400**
- Server chooses login **response** shape from trusted Electron Origin, not from `appMode`
- Client uses body refresh only when a desktop-stored refresh token exists (Vite Electron against the browser Origin still uses cookies)

## Run (dev)

```bash
pnpm db:up
pnpm db:seed:demo   # once if needed
pnpm dev:api
pnpm package:desktop
pnpm --filter @accounting-timer/desktop start:packaged
```

API base URL for packaged builds: `apps/desktop/resources/config.json` or `ACCOUNTING_TIMER_API_BASE_URL`.

## Automated verification

| Mode | Command | Claims |
|------|---------|--------|
| A Static | `pnpm verify:electron-poc` | Security source checks + dist presence + Phase 2 safeStorage IPC needles |
| B Fresh package | `pnpm verify:electron-poc -- --package` | Rebuilds package; artifact/mtime checks |
| C Runtime GUI | Manual checklist below | **Never** auto-marked PASS by scripts |

API body-refresh coverage: `apps/api` integration tests (`Desktop Origin login…`, `Browser login omits…`).

## Manual packaged acceptance checklist (C)

Complete only with API + Postgres running and a **fresh** package from mode B.

- [ ] Packaged window loads shared UI (login / home, not blank)
- [ ] Login as `employee@example.com` / `Password123!` succeeds
- [ ] After restart (or access expiry path), session restores via safeStorage refresh (not cookie)
- [ ] Navigate to Workbench; create a fictional time entry; totals update
- [ ] Fixture download via save dialog succeeds; cancel path leaves no file
- [ ] Observed API `Origin` remains `app://accounting-timer`
- [ ] Browser (`pnpm dev:web`) login still uses cookie transport (no `refreshToken` in login JSON)

Do **not** check items as passed unless performed on this machine.

## Out of scope

Signed installers, auto-update, IT distribution, monthly CSV export, offline DB.
