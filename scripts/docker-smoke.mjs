/**
 * Build production image and boot against a fresh isolated Postgres DB.
 * Uses Compose postgres_test (:5433) and a disposable database name.
 *
 *   node scripts/docker-smoke.mjs
 */
import { execSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const IMAGE = "accounting-timer:demo-smoke";
const CONTAINER = "accounting-timer-demo-smoke";
const DB_NAME = "accounting_timer_docker_smoke";
const HOST_PORT = "18080";
const EMP_PASS = "EmployeeSmoke-Pass1!";
const OP_PASS = "OperatorSmoke-Pass1!";

function run(command, opts = {}) {
  console.log(`$ ${command}`);
  return execSync(command, {
    stdio: "inherit",
    shell: true,
    ...opts,
  });
}

function runCapture(command) {
  return execSync(command, { encoding: "utf8", shell: true }).trim();
}

function cleanup() {
  try {
    execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore", shell: true });
  } catch {
    /* ignore */
  }
}

cleanup();

console.log("=== Ensuring test Postgres is up ===");
run("docker compose up -d postgres_test");

console.log("=== Creating empty smoke database ===");
run(
  `docker exec accounting-timer-postgres-test psql -U accounting -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"`,
);
run(
  `docker exec accounting-timer-postgres-test psql -U accounting -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME};"`,
);
run(
  `docker exec accounting-timer-postgres-test psql -U accounting -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};"`,
);

console.log("=== Building production image ===");
run(`docker build -t ${IMAGE} .`);

console.log("=== Verifying drizzle SQL is in the image ===");
const drizzleList = runCapture(
  `docker run --rm --entrypoint ls ${IMAGE} /app/apps/api/drizzle`,
);
if (!drizzleList.includes(".sql")) {
  console.error("FAIL: no .sql migrations in /app/apps/api/drizzle");
  process.exit(1);
}
console.log(drizzleList);

console.log("=== Starting container ===");
run(
  [
    "docker run -d",
    `--name ${CONTAINER}`,
    `-p ${HOST_PORT}:8080`,
    `-e PORT=8080`,
    `-e NODE_ENV=production`,
    `-e API_HOST=0.0.0.0`,
    `-e TRUST_PROXY=1`,
    `-e JWT_SECRET=docker-smoke-jwt-secret-not-for-prod`,
    `-e CORS_ORIGINS=http://127.0.0.1:${HOST_PORT}`,
    `-e ALLOW_DEMO_SEED=1`,
    `-e DEMO_BOOTSTRAP=1`,
    `-e DEMO_EMPLOYEE_PASSWORD=${EMP_PASS}`,
    `-e DEMO_OPERATOR_PASSWORD=${OP_PASS}`,
    `-e WEB_DIST_DIR=/app/apps/web/dist`,
    `-e DATABASE_URL=postgresql://accounting:accounting@host.docker.internal:5433/${DB_NAME}`,
    IMAGE,
  ].join(" "),
);

let ready = false;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const probe = spawnSync(
    "node",
    [
      "-e",
      `fetch('http://127.0.0.1:${HOST_PORT}/api/v1/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))`,
    ],
    { encoding: "utf8" },
  );
  if (probe.status === 0) {
    ready = true;
    break;
  }
  process.stdout.write(".");
}
console.log("");

if (!ready) {
  console.error("FAIL: readiness never became 200");
  try {
    run(`docker logs ${CONTAINER}`);
  } catch {
    /* ignore */
  }
  cleanup();
  process.exit(1);
}

console.log("=== Smoke: ready, login, clients, SPA routes ===");
const smoke = await (async () => {
  const readyRes = await fetch(`http://127.0.0.1:${HOST_PORT}/api/v1/ready`);
  if (!readyRes.ok) throw new Error(`ready ${readyRes.status}`);

  const login = await fetch(`http://127.0.0.1:${HOST_PORT}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `http://127.0.0.1:${HOST_PORT}`,
    },
    body: JSON.stringify({
      email: "employee@example.com",
      password: EMP_PASS,
    }),
  });
  if (!login.ok) throw new Error(`login ${login.status} ${await login.text()}`);
  const loginBody = await login.json();
  if (loginBody.user?.role !== "employee") {
    throw new Error("employee role mismatch");
  }
  if (loginBody.refreshToken) {
    throw new Error("browser login must not return refreshToken");
  }

  const clients = await fetch(`http://127.0.0.1:${HOST_PORT}/api/v1/clients`, {
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
  });
  if (!clients.ok) throw new Error(`clients ${clients.status}`);
  const clientList = await clients.json();
  if (!Array.isArray(clientList) || clientList.length < 3) {
    throw new Error("expected mock CRM clients");
  }

  const appPage = await fetch(`http://127.0.0.1:${HOST_PORT}/app`);
  if (!appPage.ok) throw new Error(`/app ${appPage.status}`);
  const html = await appPage.text();
  if (!html.includes("<div id=\"root\">") && !html.includes("id=\"root\"")) {
    throw new Error("/app did not return SPA shell");
  }

  const trailing = await fetch(`http://127.0.0.1:${HOST_PORT}/app/`, {
    redirect: "manual",
  });
  if (trailing.status !== 302 && trailing.status !== 301) {
    throw new Error(`/app/ expected redirect, got ${trailing.status}`);
  }

  const missingAsset = await fetch(
    `http://127.0.0.1:${HOST_PORT}/assets/does-not-exist.js`,
  );
  if (missingAsset.status !== 404) {
    throw new Error(`missing asset expected 404, got ${missingAsset.status}`);
  }
  const missingBody = await missingAsset.text();
  if (missingBody.includes("id=\"root\"")) {
    throw new Error("missing asset must not SPA-fallback");
  }

  const missingApi = await fetch(
    `http://127.0.0.1:${HOST_PORT}/api/v1/no-such-route`,
  );
  if (missingApi.status !== 404) {
    throw new Error(`missing api expected 404, got ${missingApi.status}`);
  }
  const apiBody = await missingApi.json();
  if (!apiBody.error) throw new Error("missing api should return JSON error");

  // Privileged credentials must not appear in public assets
  const index = await fetch(`http://127.0.0.1:${HOST_PORT}/`);
  const indexHtml = await index.text();
  if (
    indexHtml.includes(OP_PASS) ||
    indexHtml.includes("OperatorSmoke") ||
    indexHtml.includes(EMP_PASS)
  ) {
    throw new Error("secrets leaked into HTML");
  }

  return true;
})().catch((error) => {
  console.error(error);
  return false;
});

try {
  run(`docker logs ${CONTAINER}`);
} catch {
  /* ignore */
}

cleanup();

if (!smoke) {
  console.error("FAIL: docker smoke checks");
  process.exit(1);
}

console.log("PASS: docker image migrate + bootstrap + ready + routing smoke");
