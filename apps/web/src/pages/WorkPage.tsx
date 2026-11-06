import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, Navigate } from "react-router-dom";
import type {
  ActivityDto,
  ClientDto,
  EmployeeDto,
  SummaryReportDto,
  TimeEntryDto,
} from "@accounting-timer/shared-types";
import { ApiError, apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { budapestCalendarDate } from "../lib/budapestDate";
import {
  formatHuDate,
  formatHuHours,
  formatHuInteger,
  formatHuMonth,
} from "../lib/huFormat";
import {
  employeeOptionLabel,
  isValidWorkDate,
  selectDisplayedSheet,
  shouldApplyWorkbenchResult,
  tryReportingMonthFromWorkDate,
  workbenchScopeKey,
  type WorkbenchSheetPayload,
} from "../lib/workbenchScope";

function isOperatorRole(role: string): boolean {
  return role === "manager" || role === "admin";
}

type SheetResult = WorkbenchSheetPayload<TimeEntryDto[], SummaryReportDto>;

export function WorkPage() {
  const { state, logout } = useAuth();
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [sheetResult, setSheetResult] = useState<SheetResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const [clientId, setClientId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [workDate, setWorkDate] = useState(() => budapestCalendarDate());
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [description, setDescription] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  const loadSeqRef = useRef(0);
  const catalogLoadedRef = useRef(false);

  const isOperator =
    state.status === "authenticated" && isOperatorRole(state.user.role);
  const ownEmployeeId =
    state.status === "authenticated" ? state.user.employeeId : null;

  const viewingEmployeeId = useMemo(() => {
    if (!isOperator) return ownEmployeeId;
    return selectedEmployeeId ?? ownEmployeeId;
  }, [isOperator, ownEmployeeId, selectedEmployeeId]);

  const viewingSelf =
    viewingEmployeeId != null && viewingEmployeeId === ownEmployeeId;

  const workDateValid = isValidWorkDate(workDate);
  const reportingMonth = tryReportingMonthFromWorkDate(workDate);

  const selectedEmployeeLabel = useMemo(() => {
    if (!viewingEmployeeId) return "saját időnyilvántartás";
    const match = employees.find((e) => e.id === viewingEmployeeId);
    if (match) {
      return match.active
        ? match.displayName
        : `${match.displayName} (inaktív)`;
    }
    if (viewingSelf) return "Ön";
    return "kiválasztott munkatárs";
  }, [employees, viewingEmployeeId, viewingSelf]);

  const selectionScope = useMemo(
    () => ({
      employeeId: viewingEmployeeId,
      workDate,
    }),
    [viewingEmployeeId, workDate],
  );

  const activeScopeKey = useMemo(
    () => workbenchScopeKey(selectionScope),
    [selectionScope],
  );

  const displayedSheet = useMemo(
    () =>
      selectDisplayedSheet({
        selection: selectionScope,
        result: sheetResult,
      }),
    [selectionScope, sheetResult],
  );

  const reload = useCallback(async () => {
    if (state.status !== "authenticated") return;
    if (!isValidWorkDate(workDate)) {
      setSheetLoading(false);
      setSheetResult(null);
      return;
    }

    const operator = isOperatorRole(state.user.role);
    const targetEmployeeId = operator
      ? (selectedEmployeeId ?? state.user.employeeId)
      : state.user.employeeId;
    const month = tryReportingMonthFromWorkDate(workDate);
    if (!month) {
      setSheetResult(null);
      return;
    }

    const scopeKey = workbenchScopeKey({
      employeeId: targetEmployeeId,
      workDate,
    });
    const seq = ++loadSeqRef.current;

    setSheetLoading(true);
    setError(null);

    const employeeQuery = targetEmployeeId
      ? `&employeeId=${encodeURIComponent(targetEmployeeId)}`
      : "";

    try {
      const catalogPromises: Array<Promise<unknown>> = [];
      if (!catalogLoadedRef.current) {
        catalogPromises.push(
          apiFetch<ClientDto[]>("/api/v1/clients"),
          apiFetch<ActivityDto[]>("/api/v1/activities"),
        );
      }
      if (operator) {
        catalogPromises.push(apiFetch<EmployeeDto[]>("/api/v1/employees"));
      }

      const sheetPromises: Array<Promise<unknown>> = [
        apiFetch<TimeEntryDto[]>(
          `/api/v1/time-entries?workDate=${encodeURIComponent(workDate)}${employeeQuery}`,
        ),
        apiFetch<SummaryReportDto>(
          `/api/v1/reports/summary?workDate=${encodeURIComponent(workDate)}${employeeQuery}`,
        ),
        apiFetch<SummaryReportDto>(
          `/api/v1/reports/summary?month=${encodeURIComponent(month)}${employeeQuery}`,
        ),
      ];
      if (operator) {
        sheetPromises.push(
          apiFetch<SummaryReportDto>(
            `/api/v1/reports/summary?month=${encodeURIComponent(month)}&scope=management`,
          ),
        );
      }

      const [catalogResults, sheetResults] = await Promise.all([
        Promise.all(catalogPromises),
        Promise.all(sheetPromises),
      ]);

      if (
        !shouldApplyWorkbenchResult({
          activeKey: scopeKey,
          resultKey: scopeKey,
          activeSeq: loadSeqRef.current,
          resultSeq: seq,
        })
      ) {
        return;
      }

      let catalogOffset = 0;
      if (!catalogLoadedRef.current) {
        const clientRows = catalogResults[catalogOffset++] as ClientDto[];
        const activityRows = catalogResults[catalogOffset++] as ActivityDto[];
        setClients(clientRows);
        setActivities(activityRows);
        setClientId((current) => current || clientRows[0]?.id || "");
        setActivityId((current) => current || activityRows[0]?.id || "");
        catalogLoadedRef.current = true;
      }
      if (operator) {
        const employeeRows = catalogResults[catalogOffset] as EmployeeDto[];
        setEmployees(employeeRows);
        if (!selectedEmployeeId && state.user.employeeId) {
          setSelectedEmployeeId(state.user.employeeId);
        }
      } else {
        setEmployees([]);
      }

      setSheetResult({
        scopeKey,
        workDate,
        reportingMonth: month,
        employeeId: targetEmployeeId,
        entries: sheetResults[0] as TimeEntryDto[],
        daily: sheetResults[1] as SummaryReportDto,
        monthly: sheetResults[2] as SummaryReportDto,
        managementMonthly: operator
          ? (sheetResults[3] as SummaryReportDto)
          : null,
      });
    } catch (err) {
      if (loadSeqRef.current !== seq) return;
      setSheetResult(null);
      setError(
        err instanceof ApiError
          ? err.message
          : "Az adatok betöltése sikertelen",
      );
    } finally {
      if (loadSeqRef.current === seq) {
        setSheetLoading(false);
      }
    }
  }, [selectedEmployeeId, state, workDate]);

  useEffect(() => {
    setSheetResult(null);
  }, [activeScopeKey]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    if (!workDateValid) {
      setSheetLoading(false);
      setSheetResult(null);
      return;
    }
    void reload();
  }, [reload, state.status, activeScopeKey, workDateValid]);

  if (state.status === "loading") {
    return <main className="p-8 text-slate-600">Betöltés…</main>;
  }
  if (state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  async function onSyncCrm() {
    setMessage(null);
    setError(null);
    try {
      const result = await apiFetch<{ upserted: number }>(
        "/api/v1/crm/sync/clients",
        { method: "POST", body: "{}" },
      );
      setMessage(
        `CRM-szinkron: ${formatHuInteger(result.upserted)} ügyfél frissítve`,
      );
      catalogLoadedRef.current = false;
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "A CRM-szinkron sikertelen",
      );
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!viewingSelf || !workDateValid) return;
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/v1/time-entries", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          activityId,
          workDate,
          durationMinutes,
          description: description || undefined,
        }),
      });
      setMessage("Időrögzítés mentve");
      setDescription("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "A mentés sikertelen");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-600">
            Munkaidő-nyilvántartó
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Időrögzítés
          </h1>
          <p className="mt-1 text-slate-600">
            {state.user.email} · {state.user.role}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link className="text-sky-800 underline" to="/">
            Állapot
          </Link>
          <button
            type="button"
            className="text-slate-700 underline"
            onClick={() => void logout()}
          >
            Kijelentkezés
          </button>
        </div>
      </header>

      {state.user.role === "admin" ? (
        <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Próba CRM
          </h2>
          <button
            type="button"
            onClick={() => void onSyncCrm()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Ügyfelek szinkronizálása
          </button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Jelentési időszak
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500">Munkanap</span>
          <input
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </label>
        <p className="mt-2 text-sm text-slate-600">
          {workDateValid && reportingMonth ? (
            <>
              A napi lista erre a dátumra vonatkozik; a havi összesítés:{" "}
              <strong>{formatHuMonth(reportingMonth)}</strong>{" "}
              (Europe/Budapest naptárhónap).
            </>
          ) : (
            <>
              Adjon meg teljes munkanapot (ÉÉÉÉ-HH-NN) az összesítések
              betöltéséhez.
            </>
          )}
        </p>
      </section>

      {isOperator ? (
        <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Időnyilvántartás megtekintése
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Munkatárs</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={selectedEmployeeId ?? ownEmployeeId ?? ""}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeOptionLabel({
                    displayName: employee.displayName,
                    email: employee.email,
                    active: employee.active,
                    isSelf: employee.id === ownEmployeeId,
                  })}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-sm text-slate-600">
            Megjelenített adatok: <strong>{selectedEmployeeLabel}</strong>
            {viewingSelf
              ? ""
              : " (az operátor módosíthatja a meglévő tételeket)"}.
          </p>
        </section>
      ) : null}

      {viewingSelf ? (
        <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Új tétel
          </h2>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">Ügyfél</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isSystemInternal ? " (belső)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">Tevékenység</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
              >
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">Időtartam (perc)</span>
              <input
                type="number"
                min={1}
                max={1440}
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-slate-500">Megjegyzés</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcionális megjegyzés"
              />
            </label>
            <button
              type="submit"
              disabled={!workDateValid}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {workDateValid
                ? `Rögzítés — ${formatHuDate(workDate)}`
                : "Rögzítés"}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-950">
          Az új tételek mindig a saját munkatársi profiljához kerülnek. Válassza
          ki önmagát a listából az időrögzítéshez.
        </section>
      )}

      {(message || error) && (
        <p className={error ? "text-red-700" : "text-emerald-800"}>
          {error ?? message}
        </p>
      )}

      {sheetLoading && !displayedSheet ? (
        <p className="text-slate-600">Időnyilvántartás betöltése…</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Napi összesítés · {selectedEmployeeLabel}
          </h2>
          {displayedSheet ? (
            <>
              <p className="text-2xl font-semibold text-slate-900">
                {formatHuInteger(displayedSheet.daily.totalMinutes)} perc
              </p>
              <p className="text-sm text-slate-600">
                {formatHuHours(displayedSheet.daily.totalHoursDisplay)} óra ·{" "}
                {formatHuInteger(displayedSheet.daily.entryCount)} tétel
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {!workDateValid
                ? "Érvényes dátum szükséges"
                : sheetLoading
                  ? "Betöltés…"
                  : "Nem elérhető"}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Havi összesítés · {selectedEmployeeLabel}
            {reportingMonth ? ` · ${formatHuMonth(reportingMonth)}` : ""}
          </h2>
          {displayedSheet ? (
            <>
              <p className="text-2xl font-semibold text-slate-900">
                {formatHuInteger(displayedSheet.monthly.totalMinutes)} perc
              </p>
              <p className="text-sm text-slate-600">
                {formatHuHours(displayedSheet.monthly.totalHoursDisplay)} óra ·{" "}
                {formatHuInteger(displayedSheet.monthly.entryCount)} tétel
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {!workDateValid
                ? "Érvényes dátum szükséges"
                : sheetLoading
                  ? "Betöltés…"
                  : "Nem elérhető"}
            </p>
          )}
        </div>
      </section>

      {isOperator && displayedSheet?.managementMonthly ? (
        <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Szervezeti havi összesítés ·{" "}
            {formatHuMonth(displayedSheet.reportingMonth)}
          </h2>
          <p className="text-2xl font-semibold text-slate-900">
            {formatHuInteger(displayedSheet.managementMonthly.totalMinutes)}{" "}
            perc
          </p>
          <p className="text-sm text-slate-600">
            {formatHuHours(
              displayedSheet.managementMonthly.totalHoursDisplay,
            )}{" "}
            óra ·{" "}
            {formatHuInteger(displayedSheet.managementMonthly.entryCount)} tétel
            az összes munkatársnál
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tételek · {workDateValid ? formatHuDate(workDate) : "…"} ·{" "}
          {selectedEmployeeLabel}
        </h2>
        {!displayedSheet ? (
          <p className="text-slate-600">
            {!workDateValid
              ? "Adjon meg érvényes munkanapot a tételek betöltéséhez."
              : sheetLoading
                ? "Tételek betöltése…"
                : "A tételek nem érhetők el."}
          </p>
        ) : displayedSheet.entries.length === 0 ? (
          <p className="text-slate-600">Nincs rögzített tétel.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {displayedSheet.entries.map((entry) => {
              const client = clients.find((c) => c.id === entry.clientId);
              const activity = activities.find((a) => a.id === entry.activityId);
              return (
                <li
                  key={entry.id}
                  className="flex justify-between gap-3 border-b border-slate-200 py-2"
                >
                  <span>
                    {client?.name ?? entry.clientId} ·{" "}
                    {activity?.name ?? entry.activityId}
                    {entry.description ? ` — ${entry.description}` : ""}
                  </span>
                  <span className="font-medium">
                    {formatHuInteger(entry.durationMinutes)} perc
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
