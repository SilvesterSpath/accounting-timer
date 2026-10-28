/**
 * Phase 0 acceptance verification:
 * - Node 24 enforced
 * - Ports free before start (no false positives from unrelated servers)
 * - Spawns API + Vite, confirms they stay alive
 * - Health via API and via Vite /api proxy
 * - Cleans up only processes this script started
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps", "api");
const webDir = join(root, "apps", "web");

const API_HOST = "127.0.0.1";
const API_PORT = 3001;
const WEB_HOST = "127.0.0.1";
const WEB_PORT = 5173;

const API_HEALTH = `http://${API_HOST}:${API_PORT}/api/v1/health`;
const PROXY_HEALTH = `http://${WEB_HOST}:${WEB_PORT}/api/v1/health`;

const major = Number(process.versions.node.split(".")[0]);
if (major !== 24) {
  console.error(`FAIL: Node 24 required, got ${process.version}`);
  process.exit(1);
}
console.log(`PASS: Node ${process.version}`);

/** @returns {Promise<void>} */
function assertPortFree(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${host}:${port} is already in use. Stop the other process before verify:phase0.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
    server.listen(port, host);
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} options
 */
function spawnTracked(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = {
    child,
    name: options.env?.VERIFY_PROC_NAME ?? command,
    exited: false,
    exitCode: /** @type {number | null} */ (null),
    signal: /** @type {NodeJS.Signals | null} */ (null),
    spawnError: /** @type {Error | null} */ (null),
    log: "",
  };

  const append = (chunk) => {
    state.log += chunk.toString();
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  child.once("error", (error) => {
    state.spawnError = error;
    state.exited = true;
  });

  child.once("exit", (code, signal) => {
    state.exited = true;
    state.exitCode = code;
    state.signal = signal;
  });

  return state;
}

/** @param {ReturnType<typeof spawnTracked>} state */
function assertProcessAlive(state) {
  if (state.spawnError) {
    throw new Error(
      `${state.name} failed to start: ${state.spawnError.message}\n${state.log}`,
    );
  }
  if (state.exited) {
    throw new Error(
      `${state.name} exited unexpectedly (code=${state.exitCode}, signal=${state.signal})\n${state.log}`,
    );
  }
}

/**
 * @param {string} url
 * @param {ReturnType<typeof spawnTracked>[]} watched
 * @param {number} attempts
 */
async function waitForHealth(url, watched, attempts = 40) {
  let lastError = "not started";
  for (let i = 0; i < attempts; i += 1) {
    for (const proc of watched) {
      assertProcessAlive(proc);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        if (
          body.service === "api" &&
          body.database === "up" &&
          body.status === "ok" &&
          typeof body.node === "string" &&
          body.node.startsWith("v24.")
        ) {
          return body;
        }
        lastError = `unexpected health payload: ${JSON.stringify(body)}`;
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

/** @param {import('node:child_process').ChildProcess} child */
function requestStop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

/**
 * Stop only a process this script started; wait until it exits.
 * @param {ReturnType<typeof spawnTracked> | undefined} state
 */
async function stopStartedProcess(state) {
  if (!state) return;
  if (state.exited) return;

  const child = state.child;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      requestStop(child);
      resolve();
    }, 8000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    requestStop(child);
  });

  // Confirm termination (second force if still alive)
  if (!state.exited && child.pid) {
    requestStop(child);
    const deadline = Date.now() + 5000;
    while (!state.exited && Date.now() < deadline) {
      await delay(100);
    }
  }

  if (!state.exited) {
    throw new Error(`Failed to terminate ${state.name} (pid=${child.pid})`);
  }
}

function resolveTsxLoader() {
  const requireFromApi = createRequire(join(apiDir, "package.json"));
  return requireFromApi.resolve("tsx");
}

function resolveViteCli() {
  const requireFromWeb = createRequire(join(webDir, "package.json"));
  const vitePkgJson = requireFromWeb.resolve("vite/package.json");
  return join(dirname(vitePkgJson), "bin", "vite.js");
}

/** @type {ReturnType<typeof spawnTracked> | undefined} */
let api;
/** @type {ReturnType<typeof spawnTracked> | undefined} */
let web;
let failed = false;

try {
  await assertPortFree(API_HOST, API_PORT);
  await assertPortFree(WEB_HOST, WEB_PORT);
  console.log(`PASS: ports free (${API_HOST}:${API_PORT}, ${WEB_HOST}:${WEB_PORT})`);

  const tsxLoader = resolveTsxLoader();
  api = spawnTracked(
    process.execPath,
    ["--import", pathToFileURL(tsxLoader).href, "src/index.ts"],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        API_HOST,
        API_PORT: String(API_PORT),
        VERIFY_PROC_NAME: "api",
      },
    },
  );
  await delay(200);
  assertProcessAlive(api);

  const apiHealth = await waitForHealth(API_HEALTH, [api]);
  console.log("PASS: API /api/v1/health", apiHealth);

  const viteCli = resolveViteCli();
  web = spawnTracked(
    process.execPath,
    [
      viteCli,
      "--host",
      WEB_HOST,
      "--port",
      String(WEB_PORT),
      "--strictPort",
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        VERIFY_PROC_NAME: "vite",
      },
    },
  );
  await delay(200);
  assertProcessAlive(web);

  const proxied = await waitForHealth(PROXY_HEALTH, [api, web]);
  assertProcessAlive(api);
  assertProcessAlive(web);
  console.log("PASS: Proxied /api/v1/health via Vite", proxied);
  console.log("Phase 0 acceptance criteria met.");
} catch (error) {
  failed = true;
  console.error("FAIL:", error instanceof Error ? error.message : error);
  if (api?.log) console.error("API log:\n", api.log);
  if (web?.log) console.error("Web log:\n", web.log);
} finally {
  const stopErrors = [];
  try {
    await stopStartedProcess(web);
  } catch (error) {
    stopErrors.push(error);
  }
  try {
    await stopStartedProcess(api);
  } catch (error) {
    stopErrors.push(error);
  }
  for (const error of stopErrors) {
    console.error(
      "CLEANUP FAIL:",
      error instanceof Error ? error.message : error,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
