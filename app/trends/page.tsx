"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BiomarkerTrend = {
  biomarker: string;
  unit: string;
  points: { date: string; value: number }[];
};

type InsightResponse = {
  reportId: string;
  insights: {
    biomarkerTrends: BiomarkerTrend[];
  };
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4003";

export default function TrendsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBiomarkerKey, setSelectedBiomarkerKey] = useState<string>("");

  const biomarkerOptions = useMemo(() => {
    return (
      data?.insights?.biomarkerTrends?.map((t) => ({
        key: `${t.biomarker}||${t.unit}`,
        label: t.unit ? `${t.biomarker} (${t.unit})` : t.biomarker,
      })) || []
    );
  }, [data]);

  useEffect(() => {
    if (!data?.insights?.biomarkerTrends?.length) return;
    if (selectedBiomarkerKey) return;
    const first = data.insights.biomarkerTrends[0];
    setSelectedBiomarkerKey(`${first.biomarker}||${first.unit}`);
  }, [data]);

  const selectedTrend = useMemo(() => {
    if (!selectedBiomarkerKey) return null;
    return (
      data?.insights?.biomarkerTrends?.find(
        (t) => `${t.biomarker}||${t.unit}` === selectedBiomarkerKey
      ) || null
    ) || null;
  }, [data, selectedBiomarkerKey]);

  const chartData = useMemo(() => {
    return selectedTrend?.points?.map((p) => ({ date: p.date, value: p.value })) || [];
  }, [selectedTrend]);

  const handleLoadMockTrends = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/reports/mock/trends`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load mock trends");
      }
      const json = (await res.json()) as InsightResponse;
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load mock trends");
    } finally {
      setLoading(false);
    }
  };

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
          Biomarker trends
        </h1>
        <p className="max-w-xl text-sm text-slate-300/80 sm:text-base">
          See how biomarkers are moving between reports – closing in on optimal
          ranges or drifting away – using LLM-structured trend data.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs text-slate-300/85">
              Load trends for the latest report uploaded for this user.
            </p>
            <p className="text-[11px] text-slate-400">
              Once auth is wired, this will default to the most recent report
              in the signed-in account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {loading ? "Loading..." : "Load latest trends"}
            </button>
            <button
              onClick={handleLoadMockTrends}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-4 py-1.5 text-xs font-medium text-slate-200 shadow-lg transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-900"
            >
              {loading ? "Loading..." : "Load mock trends"}
            </button>
          </div>
        </div>

        <div className="mt-2 min-h-[260px] rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3 sm:p-4">
          {error && (
            <p className="mb-2 text-xs font-medium text-rose-300">{error}</p>
          )}
          {data && chartData.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                    Biomarker
                  </p>
                  <p className="text-xs text-slate-200">
                    {selectedTrend?.unit
                      ? selectedTrend?.biomarker
                      : selectedTrend?.biomarker}
                  </p>
                </div>
                <select
                  value={selectedBiomarkerKey}
                  onChange={(e) => setSelectedBiomarkerKey(e.target.value)}
                  className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-xs text-slate-200"
                >
                  {biomarkerOptions.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid
                      stroke="rgba(148,163,184,0.25)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                    />
                    <YAxis
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#020617",
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.5)",
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "#e5e7eb" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#22c55e" }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-xs text-slate-400">
              {loading
                ? "Fetching trend data..."
                : "No trend data yet. Load mock trends or upload a report first."}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

