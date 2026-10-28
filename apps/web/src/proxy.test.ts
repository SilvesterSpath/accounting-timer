import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("Vite config proxies /api to the local API", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const config = readFileSync(join(here, "../vite.config.ts"), "utf8");
  assert.match(config, /["']\/api["']/);
  assert.match(config, /127\.0\.0\.1:3001/);
});
