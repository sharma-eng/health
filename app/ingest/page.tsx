"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function IngestPage() {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [file, age, sex, provider]);

  const handleUpload = async () => {
    if (!file && !age && !sex && !provider) {
      setError("Upload a report or at least provide basic metadata.");
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      if (file) form.append("reportFile", file);
      if (age) form.append("age", age);
      if (sex) form.append("sex", sex);
      if (provider) form.append("provider", provider);

      const res = await fetch(`${API_BASE}/api/reports`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to upload report");
      }

      const json = await res.json();
      const reportId = json?.report?.id as string | undefined;

      if (reportId) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("vg:lastReportId", reportId);
        }

        // Immediately fetch insights once and cache them in localStorage
        try {
          const analyzeRes = await fetch(
            `${API_BASE}/api/reports/${reportId}/analyze`,
            { method: "POST" }
          );
          if (analyzeRes.ok) {
            const analysis = await analyzeRes.json();
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                "vg:lastAnalysis",
                JSON.stringify(analysis)
              );
            }
          }
        } catch {
          // Swallow analysis errors here; pages can still call backend directly.
        }

        setSuccess(
          "Report uploaded and analyzed. Insights, Trends, and Products will load instantly from this report."
        );
      } else {
        setSuccess("Report uploaded successfully.");
      }
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-balance bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Report ingestion
        </h1>
        <p className="max-w-xl text-sm text-slate-300/80 sm:text-base">
          Upload a comprehensive lab report or start with basic demographics.
          We&apos;ll normalize providers like Quest and Labcorp behind a single
          interface.
        </p>
      </header>

      <section className="glass-panel relative flex flex-col gap-4 p-5 sm:p-6">
        <div className="mt-1 grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-400/40 bg-sky-500/5 px-4 py-6 text-center text-xs text-slate-200/90 transition hover:border-sky-300/80 hover:bg-sky-500/10 sm:text-sm">
              <span className="font-medium">
                Drop your report here or click to browse
              </span>
              <span className="text-[11px] text-slate-400">
                PDF / CSV / export from Quest, Labcorp, etc.
              </span>
              <input
                type="file"
                accept=".pdf,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
            </label>
            {file && (
              <p className="truncate text-xs text-slate-300/90">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400/80 focus:bg-slate-900/60 focus:ring-1 focus:ring-sky-400/70"
              />
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-sky-400/80 focus:bg-slate-900/60 focus:ring-1 focus:ring-sky-400/70"
              >
                <option value="">Sex</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Lab provider (Quest, Labcorp, etc.)"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400/80 focus:bg-slate-900/60 focus:ring-1 focus:ring-sky-400/70"
            />
            <p className="text-[11px] text-slate-400">
              In production, we&apos;d parse the raw file into normalized
              biomarkers keyed by common marker names across providers.
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600/60 bg-slate-900/60 text-[10px] text-slate-300">
              i
            </span>
            <span>
              Auth0 login &amp; secure storage (Railway Postgres) plug in here
              for multi-report history per user.
            </span>
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-5 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {uploading ? "Uploading..." : "Upload report"}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-rose-300">{error}</p>
        )}
        {!error && success && (
          <p className="mt-2 text-xs text-emerald-300/90">{success}</p>
        )}
      </section>
    </main>
  );
}

