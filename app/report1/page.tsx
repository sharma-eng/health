"use client";

import { useEffect, useState } from "react";

type Biomarker = {
  name: string;
  value: number;
  unit: string;
  status: string;
};

type KeyFinding = {
  biomarker: string;
  status: string;
  message: string;
};

type AnalysisResponse = {
  report?: {
    id: string;
    age: number | null;
    sex: string | null;
    provider: string | null;
    biomarkers?: Biomarker[];
  };
  reportId: string;
  insights: {
    summary: string;
    keyFindings: KeyFinding[];
  };
  personalizedProducts: any[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4003";

export default function Report1Page() {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/reports/static/report1/analyze`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to analyze report1.pdf");
        }
        const json = (await res.json()) as AnalysisResponse;
        setData(json);
      } catch (e: any) {
        setError(e.message || "Analysis failed");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const biomarkers = data?.report?.biomarkers ?? [];

  return (
    <main className="flex w-full flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">
        Report 1 – Biomarkers &amp; Insights
      </h1>
      {loading && (
        <p className="text-sm text-slate-500">Analyzing report1.pdf…</p>
      )}
      {error && (
        <p className="text-sm font-medium text-red-500">
          {error}
        </p>
      )}
      {data && (
        <div className="grid gap-6 md:grid-cols-[1.1fr_minmax(0,1fr)]">
          <section className="rounded-3xl bg-white px-6 py-4 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              Biomarkers
            </h2>
            <div className="mt-3 max-h-80 overflow-y-auto text-xs text-slate-700">
              {biomarkers.length ? (
                <table className="w-full border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-[11px] text-slate-400">
                      <th className="text-left font-medium">Name</th>
                      <th className="text-left font-medium">Value</th>
                      <th className="text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {biomarkers.map((b) => (
                      <tr key={b.name} className="align-middle">
                        <td className="rounded-l-xl bg-slate-50 px-3 py-1.5">
                          {b.name}
                        </td>
                        <td className="bg-slate-50 px-3 py-1.5">
                          {b.value} {b.unit}
                        </td>
                        <td className="rounded-r-xl bg-slate-50 px-3 py-1.5 capitalize">
                          {b.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-400">
                  No structured biomarkers attached to this analysis.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white px-6 py-4 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              Insights
            </h2>
            <p className="mt-2 text-xs text-slate-600">
              {data.insights.summary}
            </p>
            <div className="mt-3 space-y-2 text-xs">
              {data.insights.keyFindings.map((k) => (
                <div
                  key={k.biomarker}
                  className="rounded-2xl bg-slate-50 px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-900">
                      {k.biomarker}
                    </span>
                    <span className="capitalize text-slate-500">
                      {k.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{k.message}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

