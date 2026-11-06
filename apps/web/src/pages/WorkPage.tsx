import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import type {
  ActivityDto,
  ClientDto,
  SummaryReportDto,
  TimeEntryDto,
} from "@accounting-timer/shared-types";
import { ApiError, apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function WorkPage() {
  const { state, logout } = useAuth();
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [entries, setEntries] = useState<TimeEntryDto[]>([]);
  const [daily, setDaily] = useState<SummaryReportDto | null>(null);
  const [monthly, setMonthly] = useState<SummaryReportDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [workDate, setWorkDate] = useState(todayIso());
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [description, setDescription] = useState("");

  const reload = useCallback(async () => {
    const [clientRows, activityRows, entryRows, daySummary, monthSummary] =
      await Promise.all([
        apiFetch<ClientDto[]>("/api/v1/clients"),
        apiFetch<ActivityDto[]>("/api/v1/activities"),
        apiFetch<TimeEntryDto[]>(
          `/api/v1/time-entries?workDate=${encodeURIComponent(workDate)}`,
        ),
        apiFetch<SummaryReportDto>(
          `/api/v1/reports/summary?workDate=${encodeURIComponent(workDate)}`,
        ),
        apiFetch<SummaryReportDto>(
          `/api/v1/reports/summary?month=${encodeURIComponent(currentMonth())}`,
        ),
      ]);
    setClients(clientRows);
    setActivities(activityRows);
    setEntries(entryRows);
    setDaily(daySummary);
    setMonthly(monthSummary);
    if (!clientId && clientRows[0]) setClientId(clientRows[0].id);
    if (!activityId && activityRows[0]) setActivityId(activityRows[0].id);
  }, [activityId, clientId, workDate]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    void reload().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Failed to load data");
    });
  }, [reload, state.status]);

  if (state.status === "loading") {
    return <main className="p-8 text-slate-600">Loading…</main>;
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
      setMessage(`CRM sync upserted ${result.upserted} clients`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "CRM sync failed");
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
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
      setMessage("Time entry saved");
      setDescription("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-600">
            Accounting Timer
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Time entry
          </h1>
          <p className="mt-1 text-slate-600">
            {state.user.email} · {state.user.role}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link className="text-sky-800 underline" to="/">
            Health
          </Link>
          <button
            type="button"
            className="text-slate-700 underline"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </header>

      {state.user.role === "admin" ? (
        <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Mock CRM
          </h2>
          <button
            type="button"
            onClick={() => void onSyncCrm()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Sync clients
          </button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          New entry
        </h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Client</span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isSystemInternal ? " (internal)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Activity</span>
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
            <span className="text-slate-500">Work date</span>
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Duration (minutes)</span>
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
            <span className="text-slate-500">Note</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2"
          >
            Save entry
          </button>
        </form>
      </section>

      {(message || error) && (
        <p className={error ? "text-red-700" : "text-emerald-800"}>
          {error ?? message}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Daily total
          </h2>
          <p className="text-2xl font-semibold text-slate-900">
            {daily?.totalMinutes ?? 0} min
          </p>
          <p className="text-sm text-slate-600">
            {(daily?.totalHoursDisplay ?? 0).toFixed(2)} h · {daily?.entryCount ?? 0}{" "}
            entries
          </p>
        </div>
        <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Month total
          </h2>
          <p className="text-2xl font-semibold text-slate-900">
            {monthly?.totalMinutes ?? 0} min
          </p>
          <p className="text-sm text-slate-600">
            {(monthly?.totalHoursDisplay ?? 0).toFixed(2)} h ·{" "}
            {monthly?.entryCount ?? 0} entries
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Entries for {workDate}
        </h2>
        {entries.length === 0 ? (
          <p className="text-slate-600">No entries yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {entries.map((entry) => {
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
                  <span className="font-medium">{entry.durationMinutes} min</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
