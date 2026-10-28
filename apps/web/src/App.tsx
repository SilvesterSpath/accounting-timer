import { useEffect, useState } from "react";
import type { HealthResponse } from "@accounting-timer/shared-types";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch("/api/v1/health");
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`);
        }
        const health = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setState({ kind: "ok", health });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              error instanceof Error ? error.message : "Unknown health error",
          });
        }
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-600">
        Accounting Timer
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
        Phase 0 scaffold
      </h1>
      <p className="max-w-2xl text-lg leading-relaxed text-slate-700">
        Shared React shell with same-origin Vite{" "}
        <code className="rounded bg-white/70 px-1.5 py-0.5 text-sm">/api</code>{" "}
        proxy. Domain features start in Phase 1.
      </p>

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Proxied API health
        </h2>
        {state.kind === "loading" && (
          <p className="text-slate-600">Checking /api/v1/health…</p>
        )}
        {state.kind === "error" && (
          <p className="text-red-700">
            {state.message}. Start Postgres (`pnpm db:up`) and the API (`pnpm
            dev:api`).
          </p>
        )}
        {state.kind === "ok" && (
          <dl className="grid grid-cols-2 gap-3 text-sm text-slate-800">
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium">{state.health.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Database</dt>
              <dd className="font-medium">{state.health.database}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Node</dt>
              <dd className="font-medium">{state.health.node}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Timestamp</dt>
              <dd className="font-medium">{state.health.timestamp}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
