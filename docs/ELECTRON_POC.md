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

Trusted `app://` URLs must use that scheme/host and **reject nonempty port, username, and password** (`isCanonicalAppUrl` in `security.ts`, enforced in protocol handler, navigation allowlist, and IPC sender checks).

**Observed packaged `Origin` (API health log, fresh win-unpacked build 2026-10-30):** `app://accounting-timer`  
Re-confirm on each review machine via the `/api/v1/health` `health origin` log line. If it differs, treat CORS as a defect until aligned.

## Security decisions

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- `ELECTRON_START_URL` honored **only** when `app.isPackaged === false` and origin is exact loopback allowlist
- Packaged builds always load `app://accounting-timer/index.html`
- Protocol rejects non-canonical hosts / ports / credentials
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

Note: Vite may bind `localhost` (IPv6 `::1`) rather than `127.0.0.1`. Prefer `http://localhost:5173` if `127.0.0.1:5173` refuses connections.

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

`start:packaged` reports process spawn only — not UI/API acceptance. Spawn failures exit non-zero with an explicit error.

Runtime API URL: packaged `resources/config.json` or `ACCOUNTING_TIMER_API_BASE_URL`.  
Invalid URLs fail startup (no silent unsafe fallback). HTTP is loopback-only; remote APIs must use HTTPS.

## Automated verification modes

| Mode | Command | Claims |
|------|---------|--------|
| A Static | `pnpm verify:electron-poc` | Source/security assertions + local dist presence |
| B Fresh package | `pnpm verify:electron-poc -- --package` | Rebuilds package; verifies artifacts/mtime |
| C Runtime GUI | Manual checklist below | **Never** auto-marked PASS by scripts |

### Automated results (2026-10-30, this machine)

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS |
| `pnpm test` (incl. script launcher tests) | PASS |
| `pnpm verify:phase0` | PASS |
| `pnpm verify:electron-poc` (A) | PASS |
| `pnpm verify:electron-poc:package` (B) | PASS — fresh `win-unpacked` mtime `2026-10-30T10:22:12.697Z` |

## Manual packaged acceptance checklist (C)

Completed against fresh package above with API + Postgres running (2026-10-30).

- [x] Packaged window renders the shared React UI (not a blank/error page) — observed: Phase 0.5 heading, Runtime `desktop`, fixture controls
- [x] In-app navigation works (Home ↔ Routing smoke) — observed both directions
- [x] API health status shows `ok` / database `up` — observed in UI
- [x] Actual request `Origin` observed and recorded: `app://accounting-timer` (API `health origin` log)
- [x] Fixture download succeeds via save dialog — saved `poc-fixture-acceptance.txt`
- [x] Fixture download cancellation returns without writing a file — UI showed `Fixture save canceled`
- [x] Saved fixture contents match expected PoC text — verified (`phase=0.5`, `purpose=verify-download-path`)
- [x] Application exits cleanly — `AccountingTimerPoC` processes gone after window close
- [x] Browser (`pnpm dev:web`) still loads health via Vite proxy — Cursor browser at `http://localhost:5173`, mode `web`, health `ok`/`up`; Home ↔ Routing smoke also exercised

Do **not** check these as passed unless performed.

## Deferred / follow-on

- Phase 1: authentication, time entry create (done on `feature/phase-1`)
- Phase 2: packaged login + safeStorage body refresh — see `docs/PHASE2.md`
- Monthly CSV (fixture download only in PoC / Phase 2)

## Not in scope

- Signed installers / auto-update
- Offline mode / real CRM / schema / domain features
- Automatic opening of external HTTP(S) links
