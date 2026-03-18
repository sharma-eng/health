"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type WearableResponse = {
  provider: string;
  status: string;
  message?: string;
  raw?: unknown;
};

export default function WearablesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WearableResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/wearables/whoop`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load wearable status");
      }
      setData(json as WearableResponse);
    } catch (e: any) {
      setError(e.message || "Failed to load wearable status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-balance bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Wearables &amp; Junction Health
        </h1>
        <p className="max-w-2xl text-sm text-slate-300/80 sm:text-base">
          Connect continuous data streams like Whoop sleep, recovery, and
          strain via Junction Health&apos;s API, and align them with slow
          moving biomarkers.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-300/85">
            This page calls your backend&apos;s Junction Health integration.
            Use Junction Link to connect Whoop for your Junction user, then
            pull live data here.
          </p>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {loading ? "Checking status..." : "Check Whoop status"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-xs text-slate-300/85">
          {error && (
            <p className="text-xs font-medium text-rose-300">{error}</p>
          )}
          {data ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {data.provider.toUpperCase()}
              </p>
              <p className="mt-1 text-[11px] text-emerald-300">
                Status: {data.status}
              </p>
              {data.message && (
                <p className="mt-2 text-xs text-slate-300/90">
                  {data.message}
                </p>
              )}
              {data.raw && (
                <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-slate-900/70 p-3 text-[10px] text-slate-200">
                  {JSON.stringify(data.raw, null, 2)}
                </pre>
              )}
            </>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300/85">
              <li>
                Use Junction Health&apos;s APIs to pull Whoop metrics and store
                them alongside reports (same user ID).
              </li>
              <li>
                Overlay recovery and strain with lipid or glucose trends to show
                the impact of behavior on labs.
              </li>
              <li>
                Surface alerts when biomarker risk and wearable strain both
                flare, for early intervention.
              </li>
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

