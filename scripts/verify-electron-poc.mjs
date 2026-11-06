/**
 * Electron PoC verification with explicit modes:
 *
 *   node scripts/verify-electron-poc.mjs
 *       A) Static source/configuration verification only
 *
 *   node scripts/verify-electron-poc.mjs --package
 *       A + B) Fresh package build verification (runs pnpm package:desktop)
 *       Does NOT claim GUI runtime success.
 *
 * Packaged GUI acceptance (C) is manual — see docs/ELECTRON_POC.md checklist.
 * Unexecuted checks are never reported as PASS.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requirePackage = process.argv.includes("--package");

const paths = {
  webDist: join(root, "apps", "web", "dist"),
  desktopDist: join(root, "apps", "desktop", "dist"),
  mainSrc: join(root, "apps", "desktop", "src", "main.ts"),
  preloadSrc: join(root, "apps", "desktop", "src", "preload.ts"),
  secureStoreSrc: join(root, "apps", "desktop", "src", "secureStore.ts"),
  protocolSrc: join(root, "apps", "desktop", "src", "protocol.ts"),
  securitySrc: join(root, "apps", "desktop", "src", "security.ts"),
  apiConfigSrc: join(root, "apps", "api", "src", "config.ts"),
  authRoutesSrc: join(root, "apps", "api", "src", "routes", "auth.ts"),
  sessionTransportSrc: join(
    root,
    "apps",
    "web",
    "src",
    "auth",
    "sessionTransport.ts",
  ),

  packagedExe: join(
    root,
    "apps",
    "desktop",
    "release",
    "win-unpacked",
    "AccountingTimerPoC.exe",
  ),
  packagedWeb: join(
    root,
    "apps",
    "desktop",
    "release",
    "win-unpacked",
    "resources",
    "web",
  ),
  packagedConfig: join(
    root,
    "apps",
    "desktop",
    "release",
    "win-unpacked",
    "resources",
    "config.json",
  ),
};

const major = Number(process.versions.node.split(".")[0]);
if (major !== 24) {
  console.error(`FAIL: Node 24 required, got ${process.version}`);
  process.exit(1);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function mustInclude(filePath, needle, label) {
  const text = readFileSync(filePath, "utf8");
  if (!text.includes(needle)) {
    fail(`${label}: missing required text ${JSON.stringify(needle)} in ${filePath}`);
  }
}

function mustNotInclude(filePath, needle, label) {
  const text = readFileSync(filePath, "utf8");
  if (text.includes(needle)) {
    fail(`${label}: forbidden text ${JSON.stringify(needle)} found in ${filePath}`);
  }
}

console.log("=== A) Static source/configuration verification ===");

mustInclude(
  paths.securitySrc,
  'CANONICAL_APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`',
  "canonical origin",
);
mustInclude(paths.securitySrc, 'APP_HOST = "accounting-timer"', "canonical host");
mustInclude(paths.securitySrc, "if (options.isPackaged)", "packaged start URL gate");
mustInclude(paths.securitySrc, "ALLOWED_DEV_ORIGINS", "dev allowlist");
mustInclude(paths.mainSrc, "contextIsolation: true", "contextIsolation");
mustInclude(paths.mainSrc, "nodeIntegration: false", "nodeIntegration");
mustInclude(paths.mainSrc, "webSecurity: true", "webSecurity");
mustInclude(paths.mainSrc, "sandbox: true", "sandbox");
mustInclude(paths.mainSrc, 'action: "deny"', "deny window open");
mustInclude(paths.mainSrc, "senderFrame", "IPC frame validation");
mustInclude(paths.mainSrc, "app.isPackaged", "packaged gate in main");
mustNotInclude(paths.mainSrc, "shell.openExternal", "no automatic external opens");
mustNotInclude(paths.mainSrc, "shell,", "shell must not be imported");

mustInclude(paths.protocolSrc, "isCanonicalAppUrl(request.url)", "protocol canonical URL check");
mustInclude(paths.securitySrc, 'url.port !== ""', "canonical URL rejects ports");
mustInclude(paths.securitySrc, "url.username", "canonical URL rejects username");
mustInclude(paths.securitySrc, "url.password", "canonical URL rejects password");
mustInclude(paths.protocolSrc, "Content-Security-Policy", "CSP");
mustInclude(paths.apiConfigSrc, "app://accounting-timer", "API CORS canonical origin");
mustInclude(
  paths.apiConfigSrc,
  "replaced entirely when CORS_ORIGINS is set",
  "CORS replace semantics",
);

console.log("=== A2) Phase 2 body refresh + safeStorage ===");
mustInclude(paths.secureStoreSrc, "safeStorage.encryptString", "safeStorage encrypt");
mustInclude(paths.secureStoreSrc, "safeStorage.decryptString", "safeStorage decrypt");
mustInclude(paths.mainSrc, "desktop:get-refresh-token", "IPC get refresh");
mustInclude(paths.mainSrc, "desktop:set-refresh-token", "IPC set refresh");
mustInclude(paths.mainSrc, "desktop:clear-refresh-token", "IPC clear refresh");
mustInclude(paths.preloadSrc, "setRefreshToken", "preload setRefreshToken");
mustInclude(paths.preloadSrc, "getRefreshToken", "preload getRefreshToken");
mustInclude(
  paths.authRoutesSrc,
  'origin === "app://accounting-timer"',
  "body refresh Origin gate",
);
mustInclude(
  paths.sessionTransportSrc,
  "readDesktopRefreshToken",
  "web desktop refresh transport",
);

if (!existsSync(join(paths.webDist, "index.html"))) {
  fail("apps/web/dist/index.html missing — run pnpm build:web");
}
const indexHtml = readFileSync(join(paths.webDist, "index.html"), "utf8");
if (indexHtml.includes('src="/assets/') || indexHtml.includes('href="/assets/')) {
  fail("web dist uses absolute /assets paths; expected relative base for app://");
}
if (!existsSync(join(paths.desktopDist, "main.js"))) {
  fail("apps/desktop/dist/main.js missing — run desktop build");
}
if (!existsSync(join(paths.desktopDist, "preload.js"))) {
  fail("apps/desktop/dist/preload.js missing");
}

console.log("PASS: static security and build-artifact source checks");

if (requirePackage) {
  console.log("=== B) Fresh package build verification ===");
  const before = Date.now();
  const pack = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["package:desktop"],
    {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );
  if (pack.status !== 0) {
    fail("pnpm package:desktop failed");
  }
  if (!existsSync(paths.packagedExe)) {
    fail(`fresh package missing exe at ${paths.packagedExe}`);
  }
  const exeStat = statSync(paths.packagedExe);
  if (exeStat.mtimeMs + 1000 < before) {
    fail("packaged exe mtime is older than this verification run (not fresh)");
  }
  if (!existsSync(join(paths.packagedWeb, "index.html"))) {
    fail("fresh package missing resources/web/index.html");
  }
  if (!existsSync(paths.packagedConfig)) {
    fail("fresh package missing resources/config.json");
  }
  const assetCount = readdirSync(join(paths.packagedWeb, "assets")).length;
  if (assetCount < 1) {
    fail("fresh package web assets missing");
  }
  console.log("PASS: fresh package artifacts present", {
    exe: paths.packagedExe,
    assetCount,
    mtime: exeStat.mtime.toISOString(),
  });
  console.log(
    "NOTE: Spawning the exe is NOT treated as runtime acceptance. See manual checklist C.",
  );
} else {
  console.log(
    "SKIP: B) Fresh package verification (pass --package to build and verify artifacts)",
  );
}

console.log("=== C) Packaged runtime acceptance ===");
console.log(
  "NOT EXECUTED by this script. Complete the manual checklist in docs/ELECTRON_POC.md.",
);
console.log(
  "Do not treat process spawn / file existence as proof the UI rendered or API Origin worked.",
);

console.log("Electron PoC verification finished (automated portions only).");
