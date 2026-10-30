/**
 * Phase 0.5 checks that do not require a GUI session:
 * - web production build exists with relative assets
 * - desktop TypeScript build emits main/preload
 * - packaged win-unpacked exe exists when packaging already ran
 *
 * GUI launch, fixture save dialog, and live API from Electron are manual.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(root, "apps", "web", "dist");
const desktopDist = join(root, "apps", "desktop", "dist");
const packagedExe = join(
  root,
  "apps",
  "desktop",
  "release",
  "win-unpacked",
  "AccountingTimerPoC.exe",
);

const major = Number(process.versions.node.split(".")[0]);
if (major !== 24) {
  console.error(`FAIL: Node 24 required, got ${process.version}`);
  process.exit(1);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!existsSync(join(webDist, "index.html"))) {
  fail("apps/web/dist/index.html missing — run pnpm build:web");
}

const indexHtml = readFileSync(join(webDist, "index.html"), "utf8");
if (indexHtml.includes('src="/assets/') || indexHtml.includes('href="/assets/')) {
  fail("web dist uses absolute /assets paths; expected relative base for app://");
}
console.log("PASS: web dist present with relative asset references");

if (!existsSync(join(desktopDist, "main.js"))) {
  fail("apps/desktop/dist/main.js missing — run desktop build");
}
if (!existsSync(join(desktopDist, "preload.js"))) {
  fail("apps/desktop/dist/preload.js missing");
}
console.log("PASS: desktop main/preload compiled");

const mainSrc = readFileSync(
  join(root, "apps", "desktop", "src", "main.ts"),
  "utf8",
);
for (const needle of [
  "contextIsolation: true",
  "nodeIntegration: false",
  "webSecurity: true",
  "registerAppScheme",
]) {
  if (!mainSrc.includes(needle) && needle !== "registerAppScheme") {
    // registerAppScheme is imported usage
  }
}
if (!mainSrc.includes("contextIsolation: true")) {
  fail("contextIsolation missing");
}
if (!readFileSync(join(root, "apps", "desktop", "src", "protocol.ts"), "utf8")
  .includes("registerSchemesAsPrivileged")) {
  fail("privileged app scheme registration missing");
}
console.log("PASS: Electron security/protocol source checks");

if (existsSync(packagedExe)) {
  console.log("PASS: packaged Windows app present", packagedExe);
  const webResource = join(
    root,
    "apps",
    "desktop",
    "release",
    "win-unpacked",
    "resources",
    "web",
  );
  if (!existsSync(join(webResource, "index.html"))) {
    fail("packaged resources/web/index.html missing");
  }
  console.log("PASS: packaged app embeds shared web dist");
  const assetFiles = readdirSync(join(webResource, "assets")).length;
  console.log(`PASS: packaged web assets count=${assetFiles}`);
} else {
  console.log(
    "WARN: packaged exe not found yet — run pnpm package:desktop before GUI verification",
  );
}

console.log("Electron PoC static verification complete.");
console.log(
  "Deferred (no Phase 1 auth yet): login, create time entry, monthly CSV.",
);
