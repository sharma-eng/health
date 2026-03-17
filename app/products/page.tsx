"use client";

import { useState } from "react";

type Product = {
  id: string;
  name: string;
  biomarker: string;
  category: string;
  retailer: string;
  url: string;
};

type InsightResponse = {
  personalizedProducts: Product[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function ProductsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const lastId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("vg:lastReportId")
        : null;
    if (!lastId) {
      setError("No report found. Upload a report on the Ingest page first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/reports/${lastId}/analyze`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to analyze report");
      }
      const json = (await res.json()) as InsightResponse;
      setData(json);
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-balance bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Product catalog &amp; personalization
        </h1>
        <p className="max-w-2xl text-sm text-slate-300/80 sm:text-base">
          Turn deficiencies and elevated risk markers into supplements,
          protocols, and exercise suggestions pulled from your retail and
          content APIs.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-300/85">
            Load personalized suggestions for the latest report uploaded for
            this user.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {loading ? "Loading..." : "Load latest suggestions"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="subtle-scrollbar flex max-h-72 flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
            {error && (
              <p className="text-xs font-medium text-rose-300">{error}</p>
            )}
            {data?.personalizedProducts?.length ? (
              data.personalizedProducts.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-2xl border border-slate-700/70 bg-slate-900/60 px-3 py-2 transition hover:border-sky-400/80 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-medium text-slate-50">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Targets: {p.biomarker}
                      </p>
                    </div>
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300">
                      {p.category}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Retailer: {p.retailer}
                  </p>
                </a>
              ))
            ) : (
              <p className="text-xs text-slate-400">
                When a deficiency or elevated risk is detected, this panel can
                surface SKUs from your retailer API (e.g., vitamin D
                supplements for low 25(OH)D, omega-3 for high triglycerides),
                plus digital coaching products and exercise templates.
              </p>
            )}
          </div>

          <div className="space-y-3 text-xs text-slate-300/85">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Architecture notes
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>
                  Call your preferred retailer API (e.g., Fullscript, Amazon,
                  in-house) from the backend, keyed by biomarker tag and
                  severity.
                </li>
                <li>
                  Add guardrails with a formulary (approved SKUs) so LLMs can
                  only choose from safe, vetted products.
                </li>
                <li>
                  Store chosen protocols per user so you can track adherence and
                  impact on follow-up labs.
                </li>
              </ul>
            </div>
            <p className="text-[11px] text-slate-500">
              This page becomes the bridge into commerce and coaching while
              keeping the glass UI focused and legible.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

