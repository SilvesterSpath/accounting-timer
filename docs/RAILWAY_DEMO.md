# Railway browser demo

Single HTTPS origin: Vite UI + Fastify `/api` in one Node service, plus one private Railway PostgreSQL plugin. Electron is **out of scope**.

## Architecture

- App service: production Docker image (`Dockerfile`)
- Postgres: Railway plugin (`DATABASE_URL`, private)
- Health check: `GET /api/v1/ready` (200 ready / 503 DB down)
- Liveness/diagnostic: `GET /api/v1/health` (always 200; may report `degraded`)

## Required environment variables

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | Injected by Railway |
| `API_HOST` | `0.0.0.0` |
| `TRUST_PROXY` | `1` (Railway edge, one hop) |
| `DATABASE_URL` | From Postgres plugin |
| `JWT_SECRET` | Strong random secret |
| `CORS_ORIGINS` | Exact public origin, e.g. `https://….up.railway.app` |
| `ALLOW_DEMO_SEED` | `1` |
| `DEMO_BOOTSTRAP` | `1` |
| `DEMO_EMPLOYEE_PASSWORD` | Visitor-only password (secret) |
| `DEMO_OPERATOR_PASSWORD` | Operator-only password (secret); **never share with visitors** |
| `WEB_DIST_DIR` | `/app/apps/web/dist` (image default) |

Optional: `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS`.

## Bootstrap

On startup with `DEMO_BOOTSTRAP=1`:

1. Migrations (`apps/api/drizzle` baked into the image)
2. Create **operator** (`operator@example.com`, admin) with `DEMO_OPERATOR_PASSWORD`
3. Create **employee** (`employee@example.com`) with `DEMO_EMPLOYEE_PASSWORD`
4. Ensure Internal client + activities
5. If no mock CRM clients, `syncMockCrm(operatorUserId)` — audit rows use the operator id

Idempotent; never truncates. Passwords must differ.

**Visitor credentials:** employee only. Operator is for operators / bootstrap audit actor.

## Local verification

```bash
pnpm --filter @accounting-timer/api test
pnpm docker:smoke
```

`pnpm docker:smoke` builds the image and boots it against an empty DB on Compose `postgres_test`.

## Hosted HTTPS acceptance (after you deploy)

Do not mark the demo live until checked on the real `https://` origin:

- [ ] Login page loads
- [ ] `/login` and `/app` survive refresh; `/app/` redirects cleanly
- [ ] Unknown `/api/*` returns API JSON, not the SPA
- [ ] Missing `/assets/*` returns 404 (not SPA HTML)
- [ ] Employee login works; employee cannot CRM-sync / elevate
- [ ] Fictional clients selectable; time entries persist; day/month totals update
- [ ] Secure cookie session restores after reload
- [ ] `/api/v1/ready` is 200; Postgres not publicly exposed
- [ ] Operator password never shared / not in public assets

## Deploy sequence (when authorized)

1. Create Railway project + Postgres plugin
2. Connect repo; Dockerfile builder; link `DATABASE_URL`
3. Set env/secrets above; set `CORS_ORIGINS` to the public HTTPS origin
4. Deploy; confirm `/api/v1/ready`
5. Complete hosted HTTPS acceptance checklist

No destructive reset tooling in this release.
