import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { HealthResponse } from "@accounting-timer/shared-types";
import { apiUrl, loadRuntimeConfig } from "../platform/config";
import { downloadFixtureFile } from "../platform/downloadFixture";
import type { RuntimeConfig } from "../platform/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "error"; message: string };

export function HomePage() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const runtime = await loadRuntimeConfig();
        if (cancelled) return;
        setConfig(runtime);

        const response = await fetch(apiUrl("/api/v1/health", runtime));
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

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onDownloadFixture() {
    setDownloadMessage(null);
    try {
      const target = await downloadFixtureFile();
      setDownloadMessage(`Fixture saved: ${target}`);
    } catch (error) {
      setDownloadMessage(
        error instanceof Error ? error.message : "Fixture download failed",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-600">
        Accounting Timer
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
        Phase 0.5 Electron feasibility
      </h1>
      <p className="max-w-2xl text-lg leading-relaxed text-slate-700">
        Same React build for browser and Electron. Auth and accounting domain
        features remain deferred to Phase 1.
      </p>

      <nav className="flex gap-4 text-sm">
        <Link className="text-sky-800 underline" to="/">
          Home
        </Link>
        <Link className="text-sky-800 underline" to="/smoke">
          Routing smoke
        </Link>
      </nav>

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Runtime
        </h2>
        {config ? (
          <dl className="grid grid-cols-2 gap-3 text-sm text-slate-800">
            <div>
              <dt className="text-slate-500">Mode</dt>
              <dd className="font-medium">{config.appMode}</dd>
            </div>
            <div>
              <dt className="text-slate-500">API base</dt>
              <dd className="font-medium break-all">
                {config.apiBaseUrl || "(same-origin / Vite proxy)"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-slate-600">Loading config…</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          API health
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

      <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Fixture download
        </h2>
        <button
          type="button"
          onClick={() => void onDownloadFixture()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Download fixture file
        </button>
        {downloadMessage && (
          <p className="mt-3 text-sm text-slate-700">{downloadMessage}</p>
        )}
      </section>
    </main>
  );
}
