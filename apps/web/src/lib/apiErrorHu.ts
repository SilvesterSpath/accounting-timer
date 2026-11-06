import { ApiError } from "../api/client";

const KNOWN: Record<string, string> = {
  Forbidden: "Nincs jogosultsága ehhez a művelethez",
  Unauthorized: "A munkamenet lejárt vagy érvénytelen",
  "month must be YYYY-MM": "A hónap formátuma érvénytelen (ÉÉÉÉ-HH)",
  "Time entry not found": "Az időrögzítés nem található",
  "Version conflict": "Ütközés: a tétel időközben módosult",
  "Unknown or inactive client": "Ismeretlen vagy inaktív ügyfél",
  "Unknown or inactive activity": "Ismeretlen vagy inaktív tevékenység",
  "Authenticated user has no employee profile":
    "A felhasználóhoz nincs munkatársi profil",
  "Invalid email or password": "Hibás e-mail vagy jelszó",
};

/** Map known English API error messages to Hungarian for display. */
export function formatApiErrorHu(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return KNOWN[err.message] ?? err.message;
  }
  if (err instanceof Error && err.message) {
    return KNOWN[err.message] ?? fallback;
  }
  return fallback;
}
