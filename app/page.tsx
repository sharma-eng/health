import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-balance bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            VitalGlass Health
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300/80 sm:text-base">
            A glassy health cockpit for your labs, trends, insights, and
            personalized products.
          </p>
        </div>
        <div className="glass-panel flex flex-col gap-1 px-4 py-2 text-xs text-slate-200/80">
          <p className="font-medium">Quick start</p>
          <p>1. Ingest a report → 2. View trends &amp; insights → 3. Explore products.</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <NavCard
          title="Report ingestion"
          description="Upload PDFs or exports from Quest, Labcorp, and others. Capture age, sex, and provider metadata."
          href="/ingest"
          badge="Step 1"
        />
        <NavCard
          title="Biomarker trends"
          description="Graph biomarker trajectories over time to see movement toward or away from optimal ranges."
          href="/trends"
          badge="Step 2"
        />
        <NavCard
          title="Key insights"
          description="LLM-generated summaries that compress your report into a short list of what actually matters."
          href="/insights"
          badge="LLM"
        />
        <NavCard
          title="Product catalog"
          description="See supplements, protocols, and exercises mapped directly to your deficiencies and risk markers."
          href="/products"
          badge="Commerce"
        />
        <NavCard
          title="Body visualizer"
          description="Explore how each biomarker maps to organs and systems across the body."
          href="/body"
          badge="Anatomy"
        />
        <NavCard
          title="Wearables & Junction"
          description="Overlay sleep, recovery, and strain from Whoop via Junction Health on top of your labs."
          href="/wearables"
          badge="Coming soon"
        />
      </section>
    </main>
  );
}

type NavCardProps = {
  title: string;
  description: string;
  href: string;
  badge?: string;
};

function NavCard({ title, description, href, badge }: NavCardProps) {
  return (
    <Link
      href={href}
      className="glass-panel group flex flex-col justify-between gap-3 p-5 transition hover:border-sky-400/70 hover:bg-slate-900/80"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-50">{title}</h2>
          {badge ? (
            <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-300">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-300/85">{description}</p>
      </div>
      <span className="mt-1 text-xs font-medium text-sky-300 group-hover:text-sky-200">
        Open {title.toLowerCase()} →
      </span>
    </Link>
  );
}
