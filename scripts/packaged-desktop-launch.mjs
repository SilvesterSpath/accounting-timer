import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function projectRootFromHere(metaUrl = import.meta.url) {
  return join(dirname(fileURLToPath(metaUrl)), "..");
}

export function getPackagedExePath(root) {
  return join(
    root,
    "apps",
    "desktop",
    "release",
    "win-unpacked",
    "AccountingTimerPoC.exe",
  );
}

export function assertPackagedExeExists(exePath) {
  if (!existsSync(exePath)) {
    const error = new Error(
      `Packaged app not found at ${exePath}. Run: pnpm package:desktop`,
    );
    error.code = "ENOENT_PACKAGE";
    throw error;
  }
}

/**
 * Process creation ≠ UI initialization. Keep messaging honest.
 */
export function formatSpawnCreatedMessage(exePath, pid) {
  return [
    `Spawned packaged process pid=${pid}`,
    `executable=${exePath}`,
    "NOTE: process creation is not proof the UI initialized or API health succeeded.",
    "Complete manual checklist C in docs/ELECTRON_POC.md before accepting runtime.",
  ].join("\n");
}

export function formatSpawnFailedMessage(exePath, detail) {
  return `Failed to spawn packaged executable (${exePath}): ${detail}`;
}
