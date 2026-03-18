"use client";

import { useState, useEffect, useMemo } from "react";

const SECTIONS = [
  { id: "summary", label: "Summary", grade: "◎" },
  { id: "heart", label: "Heart & Vascular Health", grade: "B" },
  { id: "metabolic", label: "Metabolic Health", grade: "B" },
  { id: "sex", label: "Sex Hormones", grade: "A" },
  { id: "thyroid", label: "Thyroid Health", grade: "A" },
  { id: "inflammation", label: "Inflammation", grade: "B" },
  { id: "liver", label: "Liver Health", grade: "A" },
  { id: "kidney", label: "Kidney Health", grade: "A" },
  { id: "nutrients", label: "Nutrients", grade: "A" },
  { id: "energy", label: "Energy", grade: "A" },
  { id: "immune", label: "Immune System", grade: "A" },
  { id: "dna", label: "DNA Health", grade: "A" },
  { id: "brain", label: "Brain Health", grade: "A" },
  { id: "gut", label: "Gut Health", grade: "○" },
  { id: "toxin", label: "Toxin Exposure", grade: "○" },
];

const SECTION_BLURBS: Record<string, string> = {
  summary: "Your records summarize how each system of your body is performing today.",
  heart: "Lipids, blood pressure, and cardiovascular risk markers.",
  metabolic: "Your metabolic picture shows how well you are processing and storing energy from food.",
  sex: "Sex hormone balance and related markers.",
  thyroid: "Thyroid function and related hormones.",
  inflammation: "Inflammatory markers and immune activity.",
  liver: "Liver enzymes and function markers.",
  kidney: "Kidney function: creatinine, eGFR, and related markers.",
  nutrients: "Vitamins, minerals, and nutritional status.",
  energy: "Energy metabolism and related markers.",
  immune: "Immune function and infection markers.",
  dna: "Markers related to DNA health and oxidative stress.",
  brain: "Markers that support brain health and mood.",
  gut: "Gut health and digestion-related markers.",
  toxin: "Exposure and detoxification markers.",
};

type Biomarker = {
  name: string;
  value: number;
  unit: string;
  status: string;
  referenceRange?: string;
  refMin?: number | null;
  refMax?: number | null;
  category?: string;
};

type ExtractResponse = {
  reportMeta: { source: string; fileCount: number; extracted?: boolean };
  biomarkers: Biomarker[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function BiomarkerSlider({ b }: { b: Biomarker }) {
  const refMin = b.refMin ?? null;
  const refMax = b.refMax ?? null;
  const numValue = Number(b.value);
  const hasRange = typeof refMin === "number" && typeof refMax === "number";

  const low = hasRange ? Math.min(refMin, refMax, numValue) - (refMax - refMin) * 0.1 : 0;
  const high = hasRange ? Math.max(refMin, refMax, numValue) + (refMax - refMin) * 0.1 : 100;
  const span = high - low;
  const pct = (v: number) => (span ? ((v - low) / span) * 100 : 0);
  const thumbPct = Math.min(100, Math.max(0, pct(numValue)));
  const zoneLeft = hasRange ? pct(Math.min(refMin, refMax)) : 0;
  const zoneRight = hasRange ? pct(Math.max(refMin, refMax)) : 100;

  const statusColor =
    b.status === "low" ? "text-red-600" :
    b.status === "high" || b.status === "borderline" ? "text-amber-600" :
    "text-emerald-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{b.name}</span>
        <span className={`text-sm font-semibold ${statusColor}`}>
          {typeof numValue === "number" && Number.isFinite(numValue) ? numValue : b.value} {b.unit}
        </span>
      </div>
      {b.referenceRange && (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Normal range: {b.referenceRange}
        </p>
      )}
      {hasRange && (
        <div className="mt-2">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
            {/* Red (low) | Green (normal) | Red (high) zones */}
            <div
              className="absolute left-0 top-0 h-full bg-red-300/80"
              style={{ width: `${zoneLeft}%` }}
            />
            <div
              className="absolute top-0 h-full bg-emerald-400"
              style={{ left: `${zoneLeft}%`, width: `${zoneRight - zoneLeft}%` }}
            />
            <div
              className="absolute top-0 right-0 h-full bg-red-300/80"
              style={{ width: `${100 - zoneRight}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-800 bg-white shadow-sm"
              style={{ left: `${thumbPct}%`, marginLeft: "-6px" }}
              title={`${b.value} ${b.unit}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataPage() {
  const [active, setActive] = useState<string>("summary");
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/data/extract`, {
        method: "POST",
        cache: "no-store",
      });
      const json = (await res.json()) as ExtractResponse;
      if (!res.ok) {
        setError(
          (json as { error?: string }).error || "Failed to extract biomarkers"
        );
        setBiomarkers([]);
        return;
      }
      setBiomarkers(Array.isArray(json.biomarkers) ? json.biomarkers : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setBiomarkers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const bySection = useMemo(() => {
    const map: Record<string, Biomarker[]> = {};
    for (const s of SECTIONS) {
      map[s.id] = [];
    }
    for (const b of biomarkers) {
      const cat = (b.category || "summary").toLowerCase();
      if (map[cat]) {
        map[cat].push(b);
      } else {
        map.summary = map.summary || [];
        map.summary.push(b);
      }
    }
    // Summary shows all biomarkers as overview
    map.summary = [...biomarkers];
    return map;
  }, [biomarkers]);

  const activeBiomarkers = bySection[active] ?? [];
  const title = SECTIONS.find((s) => s.id === active)?.label ?? "Records";
  const blurb = SECTION_BLURBS[active] ?? SECTION_BLURBS.summary;

  return (
    <div className="flex w-full gap-8">
      <aside className="w-64 pt-4">
        <div className="mb-3 text-xs font-medium text-slate-500">
          Twin <span className="ml-4 text-slate-300">Records</span>
        </div>
        <ul className="space-y-1 text-xs">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActive(s.id)}
                className={`flex w-full items-center gap-2 rounded-full px-3 py-1.5 text-left transition ${
                  active === s.id
                    ? "bg-black text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px]">
                  {s.grade}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex flex-1 gap-10 pt-4">
        <div className="flex w-64 items-start justify-center">
          <div className="relative flex h-80 w-32 items-center justify-center">
            <div className="h-72 w-24 rounded-full bg-gradient-to-b from-white via-slate-50 to-slate-200 shadow-[0_20px_45px_rgba(15,23,42,0.10)]" />
            {active === "metabolic" && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/70 blur-[6px] opacity-90" />
            )}
          </div>
        </div>

        <section className="flex-1">
          <div className="rounded-3xl bg-white px-8 py-6 shadow-sm ring-1 ring-slate-100">
            <h1 className="text-sm font-semibold text-slate-900">{title}</h1>
            <p className="mt-3 max-w-md text-xs text-slate-500">{blurb}</p>

            {loading && (
              <p className="mt-4 text-xs text-slate-500">
                Extracting biomarkers from PDF reports…
              </p>
            )}
            {error && !loading && (
              <p className="mt-4 text-xs font-medium text-red-600">{error}</p>
            )}
            {!loading && !error && activeBiomarkers.length === 0 && (
              <p className="mt-4 text-xs text-slate-500">
                No biomarkers in this section. Upload PDF reports to the backend reports folder and ensure OPENAI_API_KEY is set.
              </p>
            )}
            {!loading && activeBiomarkers.length > 0 && (
              <div className="mt-4 space-y-3">
                {activeBiomarkers.map((b) => (
                  <BiomarkerSlider key={`${b.name}-${b.value}`} b={b} />
                ))}
              </div>
            )}

            <button
              type="button"
              className="mt-4 inline-flex text-[11px] font-medium text-slate-500 hover:text-slate-900"
              onClick={() => refresh()}
            >
              {loading ? "Updating…" : "Update my health ↗"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
