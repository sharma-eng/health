"use client";

type MarkerDotProps = {
  label: string;
  biomarker: string;
  className?: string;
};

export default function BodyPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-balance bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Human body visualizer
        </h1>
        <p className="max-w-xl text-sm text-slate-300/80 sm:text-base">
          Explore how each biomarker in a lab report ties back to physiology –
          brain, cardiovascular, liver, kidneys, and metabolic health.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <p className="text-xs text-slate-300/80">
          This view is designed to pair with structured biomarker metadata from
          the LLM so each key finding can highlight the relevant body region.
          For example, low Vitamin D can be mapped to mood, bone, and immune
          systems, while LDL cholesterol maps to cardiovascular risk.
        </p>
        <div className="relative mt-4 flex flex-1 items-center justify-center">
          <div className="relative h-72 w-44 rounded-full border border-slate-600/60 bg-gradient-to-b from-slate-800/80 via-slate-900 to-slate-950 shadow-inner shadow-sky-500/20">
            <div className="absolute inset-x-7 top-4 h-10 rounded-full bg-slate-800/80" />
            <MarkerDot
              label="Brain / Mood"
              biomarker="Vitamin D, B12"
              className="left-1/2 top-10 -translate-x-1/2"
            />
            <MarkerDot
              label="Cardio / Lipids"
              biomarker="LDL, HDL, Triglycerides"
              className="left-1/2 top-28 -translate-x-1/2"
            />
            <MarkerDot
              label="Liver"
              biomarker="ALT, AST, GGT"
              className="left-[20%] top-28"
            />
            <MarkerDot
              label="Kidneys"
              biomarker="Creatinine, eGFR"
              className="right-[20%] top-32"
            />
            <MarkerDot
              label="Metabolic"
              biomarker="Glucose, A1c, Insulin"
              className="left-1/2 top-42 -translate-x-1/2"
            />
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

function MarkerDot({ label, biomarker, className }: MarkerDotProps) {
  return (
    <div
      className={`group absolute flex items-center gap-2 ${className ?? ""}`}
    >
      <div className="h-3 w-3 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
      <div className="pointer-events-none translate-x-1 rounded-2xl border border-slate-600/70 bg-slate-900/95 px-2 py-1 text-[10px] opacity-0 shadow-lg shadow-sky-500/30 backdrop-blur group-hover:opacity-100">
        <p className="font-semibold text-sky-200">{label}</p>
        <p className="text-[10px] text-slate-300/90">{biomarker}</p>
      </div>
    </div>
  );
}

