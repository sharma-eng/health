"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type WearableStub = {
  provider: string;
  status: string;
  message: string;
};

export default function WearablesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WearableStub | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/wearables/whoop`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load wearable status");
      }
      const json = (await res.json()) as WearableStub;
      setData(json);
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
          strain, via Junction Health&apos;s API, and align them with slow
          moving biomarkers.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-300/85">
            This page is wired to the backend stub for the Junction Health API.
            Swap in real credentials and OAuth flows to light it up.
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
              <p className="mt-2 text-xs text-slate-300/90">{data.message}</p>
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

