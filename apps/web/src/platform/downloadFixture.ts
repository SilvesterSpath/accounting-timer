const FIXTURE_BODY = [
  "Accounting Timer — Electron PoC fixture",
  "phase=0.5",
  `generatedAt=${new Date().toISOString()}`,
  "purpose=verify-download-path",
  "",
].join("\n");

export async function downloadFixtureFile(): Promise<string> {
  const fileName = "accounting-timer-fixture.txt";

  if (window.desktop) {
    const result = await window.desktop.saveFixtureFile({
      fileName,
      contents: FIXTURE_BODY,
    });
    if (!result.ok) {
      throw new Error("Fixture save canceled");
    }
    return result.path;
  }

  const blob = new Blob([FIXTURE_BODY], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}
