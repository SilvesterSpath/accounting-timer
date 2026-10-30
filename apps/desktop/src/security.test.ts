import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("desktop main enables Electron security baseline flags", () => {
  const main = readFileSync(join(here, "main.ts"), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /isTrustedSender/);
  assert.doesNotMatch(main, /webSecurity:\s*false/);
});

test("protocol registers privileged app scheme and CSP", () => {
  const protocol = readFileSync(join(here, "protocol.ts"), "utf8");
  assert.match(protocol, /registerSchemesAsPrivileged/);
  assert.match(protocol, /Content-Security-Policy/);
  assert.match(protocol, /connect-src/);
});
