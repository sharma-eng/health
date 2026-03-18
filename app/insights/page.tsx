"use client";

import { useState } from "react";

type InsightFinding = {
  biomarker: string;
  status: string;
  message: string;
};

type InsightResponse = {
  reportId: string;
  insights: {
    summary: string;
    keyFindings: InsightFinding[];
    lifestyleRecommendations: string[];
  };
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4003";

export default function InsightsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("vg:lastAnalysis")
        : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as InsightResponse;
        setData(parsed);
        return;
      } catch {
        // fall through to backend call
      }
    }

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
          LLM insights
        </h1>
        <p className="max-w-xl text-sm text-slate-300/80 sm:text-base">
          Compress a dense report into a short, clinician-grade summary with
          clear findings and lifestyle recommendations.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-300/85">
            Run insights on the latest report uploaded for this user.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {loading ? "Analyzing..." : "Run LLM insights"}
            </button>
          </div>
        </div>

        <div className="subtle-scrollbar mt-2 flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-xs">
          {error && (
            <p className="text-xs font-medium text-rose-300">{error}</p>
          )}
          {data ? (
            <>
              <p className="text-slate-200/90">{data.insights.summary}</p>
              <div className="space-y-2">
                {data.insights.keyFindings.map((k) => (
                  <div
                    key={k.biomarker}
                    className="rounded-2xl border border-slate-700/70 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                        {k.biomarker}
                      </span>
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                        {k.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300/90">
                      {k.message}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Lifestyle guidance
                </p>
                <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-300/90">
                  {data.insights.lifestyleRecommendations.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              Once wired to a real LLM provider, this view becomes the home for
              explanations, ranges, and education that sit on top of the raw
              numbers.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

