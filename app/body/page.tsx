"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import BodySilhouette, { type BodyRegionId } from "./BodySilhouette";

const REGION_BIOMARKERS: Record<BodyRegionId, string> = {
  brain: "Vitamin D, B12",
  thyroid: "TSH, T3, T4",
  heart: "LDL, HDL, Triglycerides",
  liver: "ALT, AST, GGT",
  kidney: "Creatinine, eGFR",
  metabolic: "Glucose, A1c, Insulin",
};

const REGION_LABELS: Record<BodyRegionId, string> = {
  brain: "Brain / Mood",
  thyroid: "Thyroid",
  heart: "Heart & Vascular",
  liver: "Liver",
  kidney: "Kidneys",
  metabolic: "Metabolic / Abdomen",
};

export default function BodyPage() {
  const router = useRouter();
  const [activeRegion, setActiveRegion] = useState<BodyRegionId | null>(
    null
  );

  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-balance bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Human body visualizer
        </h1>
        <p className="max-w-xl text-sm text-slate-300/80 sm:text-base">
          Explore how each biomarker in a lab report ties back to physiology –
          brain, thyroid, cardiovascular, liver, kidneys, and metabolic health.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <p className="text-xs text-slate-300/80">
          This view is designed to pair with structured biomarker metadata from
          the LLM so each key finding can highlight the relevant body region.
          For example, low Vitamin D can be mapped to mood, bone, and immune
          systems, while LDL cholesterol maps to cardiovascular risk.
        </p>

        <div className="relative mt-4 flex flex-col items-center justify-center gap-3">
          <BodySilhouette
            active={activeRegion}
            onSelect={(id) => setActiveRegion(id)}
          />

          <div className="w-full max-w-sm rounded-2xl bg-slate-900/90 p-4 text-left shadow-lg ring-1 ring-slate-600/70 backdrop-blur">
            {activeRegion ? (
              <>
                <div className="text-sm font-semibold text-sky-200">
                  {REGION_LABELS[activeRegion]}
                </div>
                <div className="mt-1 text-xs text-slate-300/90">
                  <span className="text-slate-200/90">Associated biomarkers:</span>{" "}
                  {REGION_BIOMARKERS[activeRegion]}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                    onClick={() =>
                      router.push(`/data?section=${encodeURIComponent(activeRegion)}`)
                    }
                  >
                    View {REGION_LABELS[activeRegion]} ↗
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-300/90">
                Click a highlighted region (including <span className="font-medium text-sky-200">thyroid</span>) to jump into the matching section.
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          In a production build, you can drive which regions glow based on
          insight payloads (e.g., any biomarker flagged as &quot;high&quot; or
          &quot;low&quot; in the LLM analysis) and use this page in clinician
          or concierge health workflows.
        </p>
      </section>
    </main>
  );
}

