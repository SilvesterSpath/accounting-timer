import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exe = join(
  root,
  "apps",
  "desktop",
  "release",
  "win-unpacked",
  "AccountingTimerPoC.exe",
);

if (!existsSync(exe)) {
  console.error(`Packaged app not found at ${exe}`);
  console.error("Run: pnpm package:desktop");
  process.exit(1);
}

const child = spawn(exe, [], {
  cwd: dirname(exe),
  detached: true,
  stdio: "ignore",
});
child.unref();
console.log(`Launched packaged desktop app: ${exe}`);
