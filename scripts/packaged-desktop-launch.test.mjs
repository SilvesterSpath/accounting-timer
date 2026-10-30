import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSpawnCreatedMessage,
  formatSpawnFailedMessage,
  getPackagedExePath,
} from "./packaged-desktop-launch.mjs";

test("getPackagedExePath points at win-unpacked exe", () => {
  const path = getPackagedExePath("C:\\\\repo");
  assert.match(path, /win-unpacked[/\\]AccountingTimerPoC\.exe$/);
});

test("spawn created message does not claim UI initialization", () => {
  const message = formatSpawnCreatedMessage("C:\\\\app\\\\AccountingTimerPoC.exe", 42);
  assert.match(message, /Spawned packaged process pid=42/);
  assert.match(message, /not proof the UI initialized/);
  assert.doesNotMatch(message, /Launched packaged desktop app successfully/i);
});

test("spawn failed message includes executable and detail", () => {
  const message = formatSpawnFailedMessage("C:\\\\missing.exe", "ENOENT");
  assert.match(message, /Failed to spawn/);
  assert.match(message, /missing\.exe/);
  assert.match(message, /ENOENT/);
});
