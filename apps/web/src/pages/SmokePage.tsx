import { Link } from "react-router-dom";

/** Proves client-side routing works under BrowserRouter and HashRouter. */
export function SmokePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-900">Útvonalteszt</h1>
      <p className="text-slate-700">
        Ha ezt az oldalt a kezdőlapról meg tudja nyitni, a közös router a
        jelenlegi megjelenítési módban megfelelően működik.
      </p>
      <Link className="text-sky-800 underline" to="/">
        Vissza a kezdőlapra
      </Link>
    </main>
  );
}
