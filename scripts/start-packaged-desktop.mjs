import { spawn } from "node:child_process";
import { dirname } from "node:path";
import {
  assertPackagedExeExists,
  formatSpawnCreatedMessage,
  formatSpawnFailedMessage,
  getPackagedExePath,
  projectRootFromHere,
} from "./packaged-desktop-launch.mjs";

const root = projectRootFromHere();
const exe = getPackagedExePath(root);

try {
  assertPackagedExeExists(exe);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let settled = false;
function failSpawn(detail) {
  if (settled) return;
  settled = true;
  console.error(formatSpawnFailedMessage(exe, detail));
  process.exitCode = 1;
}

function reportSpawned(pid) {
  if (settled) return;
  settled = true;
  console.log(formatSpawnCreatedMessage(exe, pid));
}

const child = spawn(exe, [], {
  cwd: dirname(exe),
  detached: true,
  stdio: "ignore",
});

child.on("error", (error) => {
  failSpawn(error.message);
});

child.on("spawn", () => {
  reportSpawned(child.pid ?? "unknown");
  child.unref();
});

// If the process exits immediately, that is not successful initialization.
child.on("exit", (code, signal) => {
  if (!settled) {
    failSpawn(`process exited before spawn confirmation (code=${code}, signal=${signal})`);
    return;
  }
  if (code !== null && code !== 0) {
    console.error(
      `Packaged process exited quickly with code=${code}. UI initialization was not verified.`,
    );
  }
});
