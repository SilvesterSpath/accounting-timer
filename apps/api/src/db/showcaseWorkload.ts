import { and, eq, isNull } from "drizzle-orm";
import { db } from "./client.js";
import { activities, clients, employees, timeEntries } from "./schema.js";
import { MOCK_CRM_CLIENTS } from "../services/crm.js";

const SHOWCASE_SOURCE = "demo_showcase";

/** Extra fictional clients for a fuller chart (Hungarian accounting flavor). */
const EXTRA_SHOWCASE_CLIENTS = [
  { externalId: "DEMO-ALFA", name: "Alfa Kft." },
  { externalId: "DEMO-DELTA", name: "Delta Audit Kft." },
] as const;

function budapestYearMonth(now = new Date()): { year: number; month: number; ym: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return {
    year,
    month,
    ym: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
  };
}

function dayInMonth(year: number, month: number, day: number): string {
  const clamped = Math.min(day, 28);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/**
 * Idempotent demo workload for the current Europe/Budapest month.
 * Uses sourceSystem/sourceRecordId so re-seed does not duplicate rows.
 */
export async function seedShowcaseWorkload(): Promise<{
  clientsEnsured: number;
  entriesInserted: number;
  month: string;
}> {
  const { year, month, ym } = budapestYearMonth();
  let clientsEnsured = 0;
  let entriesInserted = 0;

  const catalogClients = [
    ...MOCK_CRM_CLIENTS.map((c) => ({
      externalId: c.externalId,
      name: c.name,
      sourceSystem: "mock_crm" as const,
      isSystemInternal: false,
    })),
    ...EXTRA_SHOWCASE_CLIENTS.map((c) => ({
      externalId: c.externalId,
      name: c.name,
      sourceSystem: "demo_seed" as const,
      isSystemInternal: false,
    })),
  ];

  for (const row of catalogClients) {
    const existing = await db
      .select()
      .from(clients)
      .where(eq(clients.externalId, row.externalId))
      .limit(1);
    if (!existing[0]) {
      await db.insert(clients).values({
        sourceSystem: row.sourceSystem,
        externalId: row.externalId,
        name: row.name,
        active: true,
        isSystemInternal: row.isSystemInternal,
        syncedAt: new Date(),
      });
      clientsEnsured += 1;
    } else if (existing[0].name !== row.name) {
      await db
        .update(clients)
        .set({
          name: row.name,
          active: true,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, existing[0].id));
      clientsEnsured += 1;
    }
  }

  const [internal] = await db
    .select()
    .from(clients)
    .where(eq(clients.externalId, "INTERNAL"))
    .limit(1);
  const [consult] = await db
    .select()
    .from(activities)
    .where(eq(activities.code, "CONSULT"))
    .limit(1);
  const [internalActivity] = await db
    .select()
    .from(activities)
    .where(eq(activities.code, "INTERNAL"))
    .limit(1);
  if (!internal || !consult || !internalActivity) {
    return { clientsEnsured, entriesInserted, month: ym };
  }

  const clientByExternal = new Map<string, string>();
  const allClients = await db.select().from(clients);
  for (const c of allClients) {
    if (c.externalId) clientByExternal.set(c.externalId, c.id);
  }

  const empRows = await db
    .select()
    .from(employees)
    .where(eq(employees.active, true));
  const eve = empRows.find((e) => e.externalCode === "employee");
  const ben = empRows.find((e) => e.externalCode === "employee-b");
  const morgan = empRows.find((e) => e.externalCode === "manager");
  const workers = [eve, ben, morgan].filter(
    (e): e is NonNullable<typeof e> => Boolean(e),
  );
  if (workers.length === 0) {
    return { clientsEnsured, entriesInserted, month: ym };
  }

  /** Distinctive hour totals for a showcase chart (≈ mockup proportions). */
  const plan: Array<{
    externalId: string;
    activityId: string;
    chunks: Array<{ day: number; hours: number; who: number; note: string }>;
  }> = [
    {
      externalId: "CRM-100", // Pannon Könyvelő ~78 óra
      activityId: consult.id,
      chunks: [
        { day: 3, hours: 24, who: 0, note: "Havi zárás előkészítés" },
        { day: 10, hours: 22, who: 1, note: "Áfa bevallás egyeztetés" },
        { day: 17, hours: 18, who: 0, note: "Ügyfél-egyeztetés" },
        { day: 24, hours: 14, who: 2, note: "Vezetői átnézés" },
      ],
    },
    {
      externalId: "DEMO-ALFA", // Alfa ~65 óra
      activityId: consult.id,
      chunks: [
        { day: 4, hours: 20, who: 1, note: "Könyvelési egyeztetés" },
        { day: 11, hours: 18, who: 0, note: "Bérszámfejtés támogatás" },
        { day: 18, hours: 15, who: 1, note: "Dokumentum-ellenőrzés" },
        { day: 25, hours: 12, who: 0, note: "Riportkészítés" },
      ],
    },
    {
      externalId: "CRM-200", // Szabó Gábor e.v. ~54 óra
      activityId: consult.id,
      chunks: [
        { day: 5, hours: 16, who: 0, note: "Főkönyvi elemzés" },
        { day: 12, hours: 14, who: 2, note: "Kontrolling egyeztetés" },
        { day: 19, hours: 14, who: 1, note: "Adótanácsadás" },
        { day: 26, hours: 10, who: 0, note: "Záró checklist" },
      ],
    },
    {
      externalId: "CRM-300", // Kiss Mária e.v. ~45 óra
      activityId: consult.id,
      chunks: [
        { day: 6, hours: 14, who: 1, note: "Áfa bevallás előkészítés" },
        { day: 13, hours: 12, who: 0, note: "Konzultáció" },
        { day: 20, hours: 11, who: 1, note: "Számla-egyeztetés" },
        { day: 27, hours: 8, who: 2, note: "Havi összefoglaló" },
      ],
    },
    {
      externalId: "DEMO-DELTA", // Delta ~38 óra
      activityId: consult.id,
      chunks: [
        { day: 7, hours: 12, who: 0, note: "Audit előkészítés" },
        { day: 14, hours: 10, who: 1, note: "Mintavételezés" },
        { day: 21, hours: 9, who: 0, note: "Jelentéstervezet" },
        { day: 28, hours: 7, who: 1, note: "Záró egyeztetés" },
      ],
    },
    {
      externalId: "INTERNAL", // belső ~22 óra
      activityId: internalActivity.id,
      chunks: [
        { day: 8, hours: 8, who: 2, note: "Belső képzés" },
        { day: 15, hours: 6, who: 0, note: "Folyamatfejlesztés" },
        { day: 22, hours: 5, who: 1, note: "Adminisztráció" },
        { day: 28, hours: 3, who: 2, note: "Heti standing" },
      ],
    },
  ];

  for (const block of plan) {
    const clientId = clientByExternal.get(block.externalId);
    if (!clientId) continue;

    for (const [index, chunk] of block.chunks.entries()) {
      const sourceRecordId = `${ym}:${block.externalId}:${index + 1}`;
      const existing = await db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.sourceSystem, SHOWCASE_SOURCE),
            eq(timeEntries.sourceRecordId, sourceRecordId),
            isNull(timeEntries.deletedAt),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const worker = workers[chunk.who % workers.length]!;
      await db.insert(timeEntries).values({
        employeeId: worker.id,
        clientId,
        activityId: block.activityId,
        workDate: dayInMonth(year, month, chunk.day),
        durationMinutes: chunk.hours * 60,
        description: chunk.note,
        version: 1,
        source: "demo",
        sourceSystem: SHOWCASE_SOURCE,
        sourceRecordId,
        isCurrent: true,
      });
      entriesInserted += 1;
    }
  }

  return { clientsEnsured, entriesInserted, month: ym };
}
