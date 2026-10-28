/**
 * Phase 0 acceptance:
 * - Node 24 enforced
 * - Postgres up
 * - health via API and via Vite /api proxy
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps", "api");
const webDir = join(root, "apps", "web");

const major = Number(process.versions.node.split(".")[0]);
if (major !== 24) {
  console.error(`FAIL: Node 24 required, got ${process.version}`);
  process.exit(1);
}
console.log(`PASS: Node ${process.version}`);

async function waitForHealth(url, attempts = 40) {
  let lastError = "not started";
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        if (body.database === "up" && body.status === "ok") {
          return body;
        }
        lastError = `health not ready: ${JSON.stringify(body)}`;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url} (${lastError})`);
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

const api = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: apiDir,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

let apiLog = "";
api.stdout.on("data", (chunk) => {
  apiLog += chunk.toString();
});
api.stderr.on("data", (chunk) => {
  apiLog += chunk.toString();
});

let web;
let webLog = "";

try {
  const health = await waitForHealth("http://127.0.0.1:3001/api/v1/health");
  console.log("PASS: API /api/v1/health", health);

  web = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", "5173"],
    {
      cwd: webDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );
  web.stdout.on("data", (c) => {
    webLog += c.toString();
  });
  web.stderr.on("data", (c) => {
    webLog += c.toString();
  });

  const proxied = await waitForHealth("http://127.0.0.1:5173/api/v1/health");
  console.log("PASS: Proxied /api/v1/health via Vite", proxied);
  console.log("Phase 0 acceptance criteria met.");
} catch (error) {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  console.error("API log:\n", apiLog);
  if (webLog) console.error("Web log:\n", webLog);
  process.exitCode = 1;
} finally {
  if (web) killTree(web);
  killTree(api);
  await delay(400);
}
