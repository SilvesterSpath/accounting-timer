# Phase 0.5 — Electron feasibility experiment

Branch: `experiment/electron-poc`

## Goal

Prove the **same** React + Vite production build runs in:

1. Browser (Vite dev / static preview)
2. Packaged Electron on Windows via constrained `app://` protocol

Both talk to the existing Node API (`GET /api/v1/health`).

## Security decisions applied

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true` (never disabled)
- Privileged `app://` scheme serving **only** `apps/web/dist`
- CSP on protocol responses; `connect-src` limited to configured API origin
- Navigation restricted to `app://` (or Vite origin in optional dev load)
- External links via `shell.openExternal` allowlist pattern (http/https open external, in-app denied)
- Permission requests denied by default
- IPC channels allowlisted in preload; main validates sender URL

## Launch

```bash
# Terminal A
pnpm db:up
pnpm dev:api

# Browser (shared UI)
pnpm dev:web
# open http://127.0.0.1:5173

# Optional: Electron against Vite (dev only)
# ELECTRON_START_URL=http://127.0.0.1:5173 pnpm dev:desktop
```

## Package + run Windows app

```bash
pnpm package:desktop
pnpm --filter @accounting-timer/desktop start:packaged
# or run apps/desktop/release/win-unpacked/AccountingTimerPoC.exe
```

Runtime API URL: `apps/desktop/resources/config.json` (copied into packaged `resources/config.json`), override with `ACCOUNTING_TIMER_API_BASE_URL`.

## Deferred (Phase 1+)

- Authentication / refresh / safeStorage session
- Time entry create/edit
- Monthly CSV export (fixture download used instead)

## Not in scope

- Signed installers / auto-update
- Offline mode
- Real CRM
- Schema / accounting domain
