/**
 * Desktop packaged (app://) receives refreshToken in JSON and stores via safeStorage.
 * Unpackaged Electron against Vite uses cookie transport like the browser.
 * Client chooses body vs cookie from whether a desktop-stored refresh token exists —
 * not from appMode alone (T03).
 */

export type AuthPayload = {
  accessToken: string;
  refreshToken?: string;
  user: unknown;
};

export async function persistDesktopRefreshToken(
  refreshToken: string | undefined,
): Promise<void> {
  if (!window.desktop || !refreshToken) return;
  await window.desktop.setRefreshToken(refreshToken);
}

export async function readDesktopRefreshToken(): Promise<string | null> {
  if (!window.desktop) return null;
  return window.desktop.getRefreshToken();
}

export async function clearDesktopRefreshToken(): Promise<void> {
  if (!window.desktop) return;
  await window.desktop.clearRefreshToken();
}

export async function buildRefreshRequestInit(): Promise<RequestInit> {
  const refreshToken = await readDesktopRefreshToken();
  if (refreshToken) {
    return {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    };
  }
  return { method: "POST", body: "{}" };
}

export async function buildLogoutRequestInit(): Promise<RequestInit> {
  const refreshToken = await readDesktopRefreshToken();
  if (refreshToken) {
    return {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    };
  }
  return { method: "POST", body: "{}" };
}
