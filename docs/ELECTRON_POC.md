# Phase 0.5 — Electron feasibility experiment

Branch: `experiment/electron-poc`

## Goal

Prove the **same** React + Vite production build runs in:

1. Browser (Vite dev / static preview)
2. Packaged Electron on Windows via constrained `app://accounting-timer` protocol

Both talk to the existing Node API (`GET /api/v1/health`).

## Canonical application origin

| Item | Value |
|------|--------|
| Scheme | `app` |
| Host | `accounting-timer` |
| Origin | **`app://accounting-timer`** |
| Index URL | `app://accounting-timer/index.html` |

This origin is used consistently for protocol handling, navigation, IPC trust, API CORS defaults, tests, and docs.

**Observed packaged `Origin` (API health log, fresh win-unpacked build):** `app://accounting-timer`  
Re-confirm on each review machine via the `/api/v1/health` `health origin` log line. If it differs, treat CORS as a defect until aligned.

## Security decisions

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- `ELECTRON_START_URL` honored **only** when `app.isPackaged === false` and origin is exact loopback allowlist
- Packaged builds always load `app://accounting-timer/index.html`
- Protocol rejects non-canonical hosts
- Navigation uses parsed URL exact-origin checks (no string prefixes)
- IPC validates `event.sender` window, `senderFrame === mainFrame`, and trusted origin
- External `window.open` / popups: **deny all** (no `shell.openExternal` in this PoC)
- API `CORS_ORIGINS` **replaces** defaults when set (no wildcard `*`)
- Fixture IPC payload capped at 64 KiB

## Launch

```bash
pnpm db:up
pnpm dev:api
pnpm dev:web
# http://127.0.0.1:5173
```

Dev Electron against Vite (unpackaged only):

```bash
# Windows PowerShell
$env:ELECTRON_START_URL="http://127.0.0.1:5173"
pnpm dev:desktop
```

## Package

```bash
pnpm package:desktop
pnpm verify:electron-poc -- --package
pnpm --filter @accounting-timer/desktop start:packaged
```

Runtime API URL: packaged `resources/config.json` or `ACCOUNTING_TIMER_API_BASE_URL`.  
Invalid URLs fail startup (no silent unsafe fallback). HTTP is loopback-only; remote APIs must use HTTPS.

## Automated verification modes

| Mode | Command | Claims |
|------|---------|--------|
| A Static | `pnpm verify:electron-poc` | Source/security assertions + local dist presence |
| B Fresh package | `pnpm verify:electron-poc -- --package` | Rebuilds package; verifies artifacts/mtime |
| C Runtime GUI | Manual checklist below | **Never** auto-marked PASS by scripts |

## Manual packaged acceptance checklist (C)

Complete only against a **fresh** `pnpm package:desktop` build with API + Postgres running.

- [ ] Packaged window renders the shared React UI (not a blank/error page)
- [ ] In-app navigation works (Home ↔ Routing smoke)
- [ ] API health status shows `ok` / database `up`
- [ ] Actual request `Origin` observed and recorded: `_______________`
- [ ] Fixture download succeeds via save dialog
- [ ] Fixture download cancellation returns without writing a file
- [ ] Saved fixture contents match expected PoC text
- [ ] Application exits cleanly
- [ ] Browser (`pnpm dev:web`) still loads health via Vite proxy

Do **not** check these as passed unless performed.

## Deferred (Phase 1+)

- Authentication / refresh / safeStorage
- Time entry create/edit
- Monthly CSV (fixture download only in PoC)

## Not in scope

- Signed installers / auto-update
- Offline mode / real CRM / schema / domain features
- Automatic opening of external HTTP(S) links
