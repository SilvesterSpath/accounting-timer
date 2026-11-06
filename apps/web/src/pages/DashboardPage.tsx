import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { ManagementClientWorkloadDto } from "@accounting-timer/shared-types";
import { apiFetch } from "../api/client";
import { isOperatorRole } from "../auth/landingPath";
import { useAuth } from "../auth/AuthContext";
import { formatApiErrorHu } from "../lib/apiErrorHu";
import { budapestCalendarMonth } from "../lib/budapestDate";
import {
  isValidReportingMonth,
  selectDisplayedDashboard,
  shouldApplyDashboardResult,
} from "../lib/dashboardScope";
import {
  formatHuHours,
  formatHuInteger,
  formatHuMonth,
} from "../lib/huFormat";
import { formatRoleLabel } from "../lib/roleLabels";
import { ClientWorkloadChart } from "../components/ClientWorkloadChart";

export function DashboardPage() {
  const { state, logout } = useAuth();
  const [month, setMonth] = useState(() => budapestCalendarMonth());
  const [result, setResult] = useState<ManagementClientWorkloadDto | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const displayed = useMemo(
    () =>
      selectDisplayedDashboard({
        selectedMonth: month,
        result,
      }),
    [month, result],
  );

  const reload = useCallback(async () => {
    if (!isValidReportingMonth(month)) {
      setResult(null);
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<ManagementClientWorkloadDto>(
        `/api/v1/reports/management/client-workload?month=${encodeURIComponent(month)}`,
      );
      if (
        !shouldApplyDashboardResult({
          activeMonth: month,
          resultMonth: payload.month,
          activeSeq: loadSeqRef.current,
          resultSeq: seq,
        })
      ) {
        return;
      }
      setResult(payload);
    } catch (err) {
      if (loadSeqRef.current !== seq) return;
      setResult(null);
      setError(
        formatApiErrorHu(err, "A vezetői jelentés betöltése sikertelen"),
      );
    } finally {
      if (loadSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, [month]);

  useEffect(() => {
    setResult(null);
  }, [month]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    if (!isOperatorRole(state.user.role)) return;
    void reload();
  }, [reload, state]);

  if (state.status === "loading") {
    return <main className="p-8 text-slate-600">Betöltés…</main>;
  }
  if (state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  if (!isOperatorRole(state.user.role)) {
    return <Navigate to="/app" replace />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-600">
            Munkaidő-nyilvántartó
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Vezetői áttekintés
          </h1>
          <p className="mt-1 text-slate-600">
            {state.user.email} · {formatRoleLabel(state.user.role)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="text-sky-800 underline" to="/app">
            Időráfordítások megtekintése
          </Link>
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

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Havi összesítés
        </h2>
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-slate-500">Hónap</span>
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <p className="mt-2 text-sm text-slate-600">
          Alapértelmezés: aktuális hónap (Europe/Budapest).
          {isValidReportingMonth(month)
            ? ` Kiválasztva: ${formatHuMonth(month)}.`
            : ""}
        </p>
      </section>

      {error ? <p className="text-red-700">{error}</p> : null}
      {loading && !displayed ? (
        <p className="text-slate-600">Vezetői adatok betöltése…</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Összes ráfordítás
          </h2>
          {displayed ? (
            <>
              <p className="text-3xl font-semibold text-slate-900">
                {formatHuHours(displayed.totalHoursDisplay)} óra
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatHuInteger(displayed.totalMinutes)} perc ·{" "}
                {formatHuInteger(displayed.entryCount)} tétel
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {loading ? "Betöltés…" : "Nem elérhető"}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Aktív ügyfelek
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Külső ügyfelek (belső munka nélkül)
          </p>
          {displayed ? (
            <p className="text-3xl font-semibold text-slate-900">
              {formatHuInteger(displayed.activeClientCount)}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {loading ? "Betöltés…" : "Nem elérhető"}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Ügyfélráfordítások
        </h2>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">
          Ügyfelenkénti időráfordítás
        </h3>

        {!displayed ? (
          <p className="text-slate-600">
            {loading ? "Diagram betöltése…" : "Nincs megjeleníthető adat."}
          </p>
        ) : displayed.byClient.length === 0 ? (
          <p className="text-slate-600">
            Nincs adat a kiválasztott időszakra
          </p>
        ) : (
          <ClientWorkloadChart rows={displayed.byClient} />
        )}
      </section>
    </main>
  );
}
