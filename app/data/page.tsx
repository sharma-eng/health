"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import BodySilhouette, {
  type BodyRegionId,
} from "../body/BodySilhouette";

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

const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

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

const BODY_REGION_FOR_SECTION: Partial<Record<string, BodyRegionId>> = {
  brain: "brain",
  thyroid: "thyroid",
  heart: "heart",
  liver: "liver",
  kidney: "kidney",
  metabolic: "metabolic",
};

function SectionFromQuery({
  onSection,
}: {
  onSection: (section: string) => void;
}) {
  // `useSearchParams()` must be used inside a Suspense boundary to avoid
  // prerender/build failures with CSR bailout.
  const searchParams = useSearchParams();

  useEffect(() => {
    const section = searchParams.get("section");
    if (!section) return;
    if (SECTION_IDS.has(section)) onSection(section);
  }, [onSection, searchParams]);

  return null;
}

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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4003";

type BiomarkerExplanation = {
  name: string;
  whatItIs: string;
  whyItMatters: string;
  whatHighMeans: string;
  whatLowMeans: string;
  whatBorderlineMeans: string;
  normalMeans: string;
  practicalNotes: string[];
  questionsForClinician: string[];
  disclaimer: string;
};

function BiomarkerSlider({
  b,
  onClick,
}: {
  b: Biomarker;
  onClick: () => void;
}) {
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
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
        if (e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 hover:bg-slate-100"
      title="Click for more information"
    >
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

type BiomarkerTrendPoint = { date: string; value: number };
type BiomarkerWhoopOverlay = {
  biomarkerName: string;
  whoopMetricLabel: string; // e.g. "Sleep hours" / "Steps"
  points: { date: string; biomarkerValue: number; whoopValue: number | null }[];
};

function TrendOverlayMiniChart({ overlay }: { overlay: BiomarkerWhoopOverlay }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={overlay.points}
        margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
      >
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          tick={{ fontSize: 9, fill: "#94a3b8" }}
          tickFormatter={(d) => (typeof d === "string" ? d.slice(5) : d)}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          tick={{ fontSize: 9, fill: "#94a3b8" }}
          width={28}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          tick={{ fontSize: 9, fill: "#94a3b8" }}
          width={28}
        />
        <Tooltip
          labelStyle={{ color: "#e5e7eb" }}
          contentStyle={{
            background: "#020617",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.5)",
            fontSize: 11,
          }}
          formatter={(value: any, name: any) => {
            if (name === "whoopValue") {
              return [`${value ?? "—"} ${overlay.whoopMetricLabel}`, "WHOOP"];
            }
            return [value ?? "—", "Biomarker"];
          }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="biomarkerValue"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="whoopValue"
          stroke="#38bdf8"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function DataPage() {
  const [active, setActive] = useState<string>("summary");
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type MockTrendPoint = { date: string; value: number };
  type MockBiomarkerTrend = {
    biomarker: string;
    unit: string;
    points: MockTrendPoint[];
  };

  const [mockTrends, setMockTrends] = useState<MockBiomarkerTrend[] | null>(
    null
  );
  const [whoopTrendRaw, setWhoopTrendRaw] = useState<any | null>(null);
  const [trendLoading, setTrendLoading] = useState<boolean>(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [infoOpen, setInfoOpen] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Biomarker | null>(null);
  const [explanation, setExplanation] = useState<BiomarkerExplanation | null>(
    null
  );
  const [personalInsight, setPersonalInsight] = useState<any | null>(null);
  const [personalInsightLoading, setPersonalInsightLoading] =
    useState<boolean>(false);
  const [personalInsightError, setPersonalInsightError] = useState<
    string | null
  >(null);

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

  const isDeficient = (status?: string | null) => {
    const s = (status || "").toLowerCase().trim();
    // Be resilient to missing/async status: if status isn't present, still show
    // the recommendations (backend always returns productRecommendations).
    if (!s) return true;
    // Only hide for explicitly normal range.
    return s !== "normal";
  };

  useEffect(() => {
    refresh();
  }, []);

  // Load mocked report biomarker trends + WHOOP history for overlap.
  useEffect(() => {
    const loadOverlapTrends = async () => {
      setTrendLoading(true);
      setTrendError(null);
      setMockTrends(null);
      setWhoopTrendRaw(null);

      try {
        const trendsRes = await fetch(
          `${API_BASE}/api/reports/static/report1/analyze`,
          { method: "POST", cache: "no-store" }
        );
        const trendsJson = await trendsRes.json().catch(() => ({}));
        if (!trendsRes.ok) {
          throw new Error(
            trendsJson.error || "Failed to load mocked biomarker trends"
          );
        }

        const trends =
          trendsJson?.insights?.biomarkerTrends && Array.isArray(trendsJson.insights.biomarkerTrends)
            ? (trendsJson.insights.biomarkerTrends as MockBiomarkerTrend[])
            : [];
        setMockTrends(trends);

        const ymd = (v: unknown): v is string =>
          typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

        const allDates = trends.flatMap((t) =>
          (t.points || []).map((p) => p.date).filter(ymd)
        );
        if (!allDates.length) {
          setTrendLoading(false);
          return;
        }

        allDates.sort();
        const earliest = allDates[0];
        const end_date = allDates[allDates.length - 1];

        // Avoid extremely large historical pulls: cap to a reasonable window.
        const MAX_DAYS = 900;
        const endDateObj = new Date(`${end_date}T00:00:00Z`);
        const startCap = new Date(endDateObj);
        startCap.setUTCDate(startCap.getUTCDate() - MAX_DAYS);
        const startCapYmd = startCap.toISOString().slice(0, 10);
        const start_date = earliest > startCapYmd ? earliest : startCapYmd;

        const whoopRes = await fetch(
          `${API_BASE}/api/wearables/whoop?start_date=${start_date}&end_date=${end_date}`,
          { cache: "no-store" }
        );
        const whoopJson = await whoopRes.json().catch(() => ({}));
        if (!whoopRes.ok) {
          // WHOOP overlap is optional; don't block the rest of the page.
          console.warn(
            "WHOOP history load failed:",
            whoopJson.message || whoopJson.error || whoopRes.status
          );
          setWhoopTrendRaw(null);
          return;
        }

        setWhoopTrendRaw(whoopJson?.raw ?? whoopJson ?? null);
      } catch (e: unknown) {
        // WHOOP overlap is best-effort; keep UI usable even if it fails.
        console.warn("WHOOP history request error (non-fatal):", e);
        setWhoopTrendRaw(null);
        setTrendError(null);
      } finally {
        setTrendLoading(false);
      }
    };

    loadOverlapTrends();
  }, []);

  // Allow deep-linking: /data?section=thyroid (etc).
  // Suspense is required for `useSearchParams()` on Next.js App Router.
  const onSectionFromQuery = useCallback(
    (section: string) => setActive(section),
    []
  );

  useEffect(() => {
    if (!infoOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [infoOpen]);

  const openInfo = async (b: Biomarker) => {
    setSelected(b);
    setExplanation(null);
    setInfoError(null);
    setInfoOpen(true);
    setInfoLoading(true);
    setPersonalInsight(null);
    setPersonalInsightError(null);
    setPersonalInsightLoading(true);

    const overlapForThis =
      trendLoading || !mockTrends || !whoopTrendRaw
        ? null
        : getOverlayForBiomarker(b);
    try {
      const res = await fetch(`${API_BASE}/api/biomarker/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: b.name,
          status: b.status,
          unit: b.unit,
          referenceRange: b.referenceRange,
          category: b.category,
        }),
      });
      const json = (await res.json()) as { explanation?: BiomarkerExplanation; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load biomarker explanation");
      }
      setExplanation(json.explanation ?? null);
    } catch (e: unknown) {
      setInfoError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setInfoLoading(false);
    }

    try {
      const personalRes = await fetch(
        `${API_BASE}/api/biomarker/personal-insight`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            biomarker: {
              name: b.name,
              status: b.status,
              unit: b.unit,
              referenceRange: b.referenceRange,
              category: b.category,
              value: b.value,
            },
            whoopOverlay: overlapForThis
              ? { whoopMetricLabel: overlapForThis.whoopMetricLabel, points: overlapForThis.points }
              : { whoopMetricLabel: "", points: [] },
          }),
        }
      );
      const personalJson = (await personalRes.json()) as {
        personalInsight?: any;
        error?: string;
      };
      if (!personalRes.ok) {
        throw new Error(
          personalJson.error ||
            "Failed to load personal insight for this biomarker"
        );
      }
      setPersonalInsight(personalJson.personalInsight ?? null);
    } catch (e: unknown) {
      setPersonalInsightError(
        e instanceof Error ? e.message : "Request failed"
      );
    } finally {
      setPersonalInsightLoading(false);
    }
  };

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

  function statusToScore(status?: string): number {
    const s = (status || "").toString().toLowerCase();
    if (s === "normal") return 100;
    if (s === "borderline") return 75;
    if (s === "high" || s === "low") return 50;
    // If the extraction produced an unexpected status string, don't overly
    // penalize; treat as “unknown but not clearly abnormal”.
    return 60;
  }

  function computeHealthScore(
    items: Biomarker[]
  ): { score: number; counted: number } | null {
    const withStatus = items.filter(
      (b) => typeof b.status === "string" && b.status.trim().length > 0
    );
    if (!withStatus.length) return null;
    const sum = withStatus.reduce((acc, b) => acc + statusToScore(b.status), 0);
    return { score: Math.round(sum / withStatus.length), counted: withStatus.length };
  }

  const overallScore = useMemo(
    () => computeHealthScore(biomarkers),
    [biomarkers]
  );
  const categoryScore = useMemo(
    () => computeHealthScore(activeBiomarkers),
    [activeBiomarkers]
  );
  const displayedScore = active === "summary" ? overallScore : categoryScore;

  function scoreToLevel(score: number): "good" | "ok" | "bad" {
    if (score >= 85) return "good";
    if (score >= 70) return "ok";
    return "bad";
  }

  function ScoreMeter({
    score,
  }: {
    score: number;
  }): React.ReactNode {
    const level = scoreToLevel(score);
    const fillPct = Math.max(0, Math.min(100, score));

    const track =
      level === "good"
        ? "bg-emerald-100"
        : level === "ok"
          ? "bg-amber-100"
          : "bg-rose-100";
    const fill =
      level === "good"
        ? "bg-emerald-500"
        : level === "ok"
          ? "bg-amber-500"
          : "bg-rose-500";

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Health score
          </span>
          <span className="text-[11px] font-semibold text-slate-700">
            {score}/100
          </span>
        </div>
        <div className={`h-2 w-full overflow-hidden rounded-full ${track}`}>
          <div
            className={`h-full ${fill}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    );
  }

  const sleepHoursByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];

    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const raw = s?.total != null ? s.total : s?.total_sleep_duration;
      if (raw == null) continue;
      const hours = Number(raw) / 3600;
      if (Number.isFinite(hours)) map[date] = hours;
    }
    return map;
  }, [whoopTrendRaw]);

  const stepsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const activityArr =
      whoopTrendRaw?.activity?.activity ||
      whoopTrendRaw?.activity ||
      whoopTrendRaw?.daily?.activity ||
      [];

    if (!Array.isArray(activityArr)) return map;
    for (const a of activityArr) {
      const date =
        a?.calendar_date ||
        (typeof a?.date === "string" ? a.date.slice(0, 10) : null);
      if (!date) continue;
      const steps = a?.steps;
      if (steps == null) continue;
      const n = Number(steps);
      if (Number.isFinite(n)) map[date] = n;
    }
    return map;
  }, [whoopTrendRaw]);

  const avgBpmByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const activityArr =
      whoopTrendRaw?.activity?.activity ||
      whoopTrendRaw?.activity ||
      whoopTrendRaw?.daily?.activity ||
      [];

    if (!Array.isArray(activityArr)) return map;
    for (const a of activityArr) {
      const date =
        a?.calendar_date ||
        (typeof a?.date === "string" ? a.date.slice(0, 10) : null);
      if (!date) continue;

      const avgBpm = a?.heart_rate?.avg_bpm;
      if (avgBpm == null) continue;
      const n = Number(avgBpm);
      if (Number.isFinite(n)) map[date] = n;
    }
    return map;
  }, [whoopTrendRaw]);

  const sleepScoreByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const v = s?.score;
      if (v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n)) map[date] = n;
    }
    return map;
  }, [whoopTrendRaw]);

  const sleepEfficiencyByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const v = s?.efficiency;
      if (v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n)) map[date] = n;
    }
    return map;
  }, [whoopTrendRaw]);

  const sleepHrvByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const v = s?.average_hrv;
      if (v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n)) map[date] = n;
    }
    return map;
  }, [whoopTrendRaw]);

  const sleepRespRateByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const v = s?.respiratory_rate;
      if (v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n)) map[date] = n;
    }
    return map;
  }, [whoopTrendRaw]);

  const remHoursByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const v = s?.rem;
      if (v == null) continue;
      const hours = Number(v) / 3600;
      if (Number.isFinite(hours)) map[date] = hours;
    }
    return map;
  }, [whoopTrendRaw]);

  const deepHoursByDate = useMemo(() => {
    const map: Record<string, number> = {};
    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (!Array.isArray(sleepArr)) return map;
    for (const s of sleepArr) {
      const date = s?.calendar_date || (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
      if (!date) continue;
      const v = s?.deep;
      if (v == null) continue;
      const hours = Number(v) / 3600;
      if (Number.isFinite(hours)) map[date] = hours;
    }
    return map;
  }, [whoopTrendRaw]);

  const restingHrByDate = useMemo(() => {
    const map: Record<string, number> = {};

    // Prefer resting HR from activity if present; otherwise fall back to sleep hr_resting.
    const activityArr =
      whoopTrendRaw?.activity?.activity ||
      whoopTrendRaw?.activity ||
      whoopTrendRaw?.daily?.activity ||
      [];
    if (Array.isArray(activityArr)) {
      for (const a of activityArr) {
        const date =
          a?.calendar_date ||
          (typeof a?.date === "string" ? a.date.slice(0, 10) : null);
        if (!date) continue;
        const v = a?.heart_rate?.resting_bpm;
        if (v == null) continue;
        const n = Number(v);
        if (Number.isFinite(n)) map[date] = n;
      }
    }

    const sleepArr =
      whoopTrendRaw?.sleep?.sleep ||
      whoopTrendRaw?.sleep ||
      whoopTrendRaw?.daily?.sleep ||
      [];
    if (Array.isArray(sleepArr)) {
      for (const s of sleepArr) {
        const date =
          s?.calendar_date ||
          (typeof s?.date === "string" ? s.date.slice(0, 10) : null);
        if (!date) continue;
        if (map[date] != null) continue;
        const v = s?.hr_resting;
        if (v == null) continue;
        const n = Number(v);
        if (Number.isFinite(n)) map[date] = n;
      }
    }

    return map;
  }, [whoopTrendRaw]);

  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

  const overlapDates = useMemo(() => {
    // Use the mocked report trend dates as the overlap window.
    const dates =
      mockTrends?.flatMap((t) =>
        (t.points || [])
          .map((p) => p.date)
          .filter((d) => typeof d === "string" && ymdRe.test(d))
      ) ?? [];

    const unique = Array.from(new Set(dates));
    unique.sort();
    // Use the full mocked report date range.
    return unique;
  }, [mockTrends]);

  const normalizeName = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const whoopMetricForBiomarker = (b: Biomarker): {
    key:
      | "steps"
      | "sleep_hours"
      | "avg_bpm"
      | "sleep_score"
      | "sleep_efficiency"
      | "sleep_hrv"
      | "sleep_resp_rate"
      | "rem_hours"
      | "deep_hours"
      | "resting_hr";
    label: string;
  } => {
    const cat = (b.category || "").toLowerCase();
    const n = normalizeName(b.name);

    if (cat === "heart") return { key: "avg_bpm", label: "Avg BPM" };
    if (n.includes("vitamin d")) {
      return { key: "sleep_hours", label: "Sleep hours (h)" };
    }
    if (cat === "inflammation") {
      return { key: "sleep_hrv", label: "Sleep HRV" };
    }
    if (cat === "metabolic") {
      return { key: "sleep_efficiency", label: "Sleep efficiency (%)" };
    }
    if (cat === "sex" || cat === "thyroid") {
      return { key: "sleep_score", label: "Sleep score" };
    }
    if (cat === "liver" || cat === "kidney" || cat === "immune") {
      return { key: "resting_hr", label: "Resting HR (bpm)" };
    }
    return { key: "steps", label: "Steps" };
  };

  const hashToUnit = (s: string) => {
    // Deterministic 0..1 value based on the biomarker name
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000;
    return h / 1000000;
  };

  const getOverlayForBiomarker = (b: Biomarker) => {
    if (!overlapDates.length) return null;

    const metric = whoopMetricForBiomarker(b);
    const base = Number(b.value);
    if (!Number.isFinite(base)) return null;

    const n = overlapDates.length;
    const amp = 0.03 + hashToUnit(b.name) * 0.08; // ~3%..11%

    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    const coreKey = (s: string) => {
      const n = normalize(s);
      if (n.includes("vitamin d")) return "vitamin d";
      if (n.includes("ldl")) return "ldl";
      if (n.includes("hdl")) return "hdl";
      if (n.includes("triglycer")) return "triglycerides";
      if (n.includes("testosterone")) return "testosterone";
      if (n.includes("estradiol") || n.includes("estradi")) return "estradiol";
      if (n.includes("tsh")) return "tsh";
      if (n.includes("free t4") || n.includes("ft4")) return "free t4";
      if (n.includes("free t3") || n.includes("ft3")) return "free t3";
      return null;
    };

    const bCore = coreKey(b.name);
    const trendForName = bCore
      ? mockTrends?.find((t) => coreKey(t.biomarker) === bCore) ?? null
      : mockTrends?.find((t) => {
          const tNorm = normalize(t.biomarker);
          const bNorm = normalize(b.name);
          return bNorm.includes(tNorm) || tNorm.includes(bNorm);
        }) ?? null;

    const trendByDate: Record<string, number> = {};
    for (const p of trendForName?.points || []) {
      if (typeof p.date === "string" && ymdRe.test(p.date)) {
        trendByDate[p.date] = p.value;
      }
    }

    const points = overlapDates.map((date, idx) => {
      const rel = n <= 1 ? 0 : (idx - (n - 1) / 2) / ((n - 1) / 2); // -1..+1
      const biomarkerValue =
        trendByDate[date] != null ? trendByDate[date] : base * (1 + amp * rel);
      const whoopValue =
        metric.key === "steps"
          ? stepsByDate[date] ?? null
          : metric.key === "sleep_hours"
            ? sleepHoursByDate[date] ?? null
            : metric.key === "avg_bpm"
              ? avgBpmByDate[date] ?? null
              : metric.key === "sleep_score"
                ? sleepScoreByDate[date] ?? null
                : metric.key === "sleep_efficiency"
                  ? sleepEfficiencyByDate[date] ?? null
                  : metric.key === "sleep_hrv"
                    ? sleepHrvByDate[date] ?? null
                    : metric.key === "sleep_resp_rate"
                      ? sleepRespRateByDate[date] ?? null
                      : metric.key === "rem_hours"
                        ? remHoursByDate[date] ?? null
                        : metric.key === "deep_hours"
                          ? deepHoursByDate[date] ?? null
                          : metric.key === "resting_hr"
                            ? restingHrByDate[date] ?? null
                            : null;

      return {
        date,
        biomarkerValue,
        whoopValue,
      };
    });

    if (!points.length) return null;

    return {
      biomarkerName: b.name,
      whoopMetricLabel: metric.label,
      points,
    } satisfies BiomarkerWhoopOverlay;
  };

  const overlayForSelected = selected
    ? trendLoading
      ? null
      : getOverlayForBiomarker(selected)
    : null;

  return (
    <div className="flex w-full gap-8">
      <Suspense fallback={null}>
        <SectionFromQuery onSection={onSectionFromQuery} />
      </Suspense>
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
          <BodySilhouette
            active={BODY_REGION_FOR_SECTION[active] ?? null}
            onSelect={(id) => setActive(id)}
          />
        </div>

        <section className="flex-1">
          <div className="rounded-3xl bg-white px-8 py-6 shadow-sm ring-1 ring-slate-100">
            <h1 className="text-sm font-semibold text-slate-900">{title}</h1>
            <p className="mt-3 max-w-md text-xs text-slate-500">{blurb}</p>

            {!loading && displayedScore && (
              <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-700">
                      {active === "summary" ? "Overall health score" : "Category score"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Based on {displayedScore.counted} markers
                    </div>
                  </div>
                  <div className="w-40">
                    <ScoreMeter score={displayedScore.score} />
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <p className="mt-4 text-xs text-slate-500">
                Extracting biomarkers from PDF reports…
              </p>
            )}
            {error && !loading && (
              <p className="mt-4 text-xs font-medium text-red-600">{error}</p>
            )}
            {trendError && (
              <p className="mt-4 text-xs font-medium text-red-600">
                WHOOP history request error: {trendError}
              </p>
            )}
            {!loading && !error && activeBiomarkers.length === 0 && (
              <p className="mt-4 text-xs text-slate-500">
                No biomarkers in this section. Upload PDF reports to the backend reports folder and ensure OPENAI_API_KEY is set.
              </p>
            )}
            {!trendLoading && overlapDates.length > 0 && (
              <p className="mt-3 text-[11px] text-slate-500">
                Overlap window: {overlapDates.join(", ")} · WHOOP sleep records:{" "}
                {Array.isArray(whoopTrendRaw?.sleep?.sleep)
                  ? whoopTrendRaw.sleep.sleep.length
                  : 0}
                {" · "}
                WHOOP activity records:{" "}
                {Array.isArray(whoopTrendRaw?.activity?.activity)
                  ? whoopTrendRaw.activity.activity.length
                  : 0}
              </p>
            )}
            {!loading && activeBiomarkers.length > 0 && (
              <div className="mt-4 space-y-3">
                {activeBiomarkers.map((b) => (
                  <BiomarkerSlider
                    key={`${b.name}-${b.value}-${b.unit}`}
                    b={b}
                    onClick={() => openInfo(b)}
                  />
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

      {/* Info modal */}
      {infoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInfoOpen(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {selected?.name ?? "Biomarker"}
                </h2>
                {selected && (
                  <p className="mt-1 text-xs text-slate-600">
                    {selected.value} {selected.unit} · Status: {selected.status}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="rounded-full px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              {infoLoading && (
                <p className="text-sm text-slate-600">Loading details…</p>
              )}
              {infoError && (
                <p className="text-sm font-medium text-red-600">{infoError}</p>
              )}

              {!infoLoading && !infoError && explanation && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      What it is
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">
                      {explanation.whatItIs}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Why it matters
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">
                      {explanation.whyItMatters}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      WHOOP overlap trend
                    </h3>
                    {trendLoading && (
                      <p className="mt-2 text-sm text-slate-700">
                        Loading WHOOP history…
                      </p>
                    )}
                    {!trendLoading && overlayForSelected?.points?.length ? (
                      <div className="mt-2 h-72">
                        <TrendOverlayMiniChart overlay={overlayForSelected} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-700">
                        No WHOOP overlap data available for this biomarker’s trend window.
                      </p>
                    )}

                    {!trendLoading &&
                      overlayForSelected?.points?.some((p) => p.whoopValue == null) && (
                        <p className="mt-2 text-xs text-slate-600">
                          Some overlap dates are missing WHOOP data. Connect WHOOP in Junction and refresh.
                        </p>
                      )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 2l1.2 4.3L18 8l-4.8 1.7L12 14l-1.2-4.3L6 8l4.8-1.7L12 2z" />
                          <path d="M20 14l.7 2.3L23 17l-2.3.7L20 20l-.7-2.3L17 17l2.3-.7L20 14z" />
                        </svg>
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Personal Insight
                      </h3>
                    </div>

                    {personalInsightLoading && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                        </span>
                        Generating personalized trend insight…
                      </div>
                    )}

                    {personalInsightError && (
                      <p className="mt-2 text-sm font-medium text-red-600">
                        {personalInsightError}
                      </p>
                    )}

                    {!personalInsightLoading &&
                      !personalInsightError &&
                      personalInsight && (
                        <div className="mt-2 space-y-3">
                          {personalInsight.summary && (
                            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-slate-800">
                              {personalInsight.summary}
                            </p>
                          )}

                          {personalInsight.trendExplanation && (
                            <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-slate-800">
                              {personalInsight.trendExplanation}
                            </p>
                          )}

                          {Array.isArray(
                            personalInsight.productRecommendations
                          ) &&
                            personalInsight.productRecommendations.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-slate-900">
                                  Supplements / products
                                </p>
                                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                                  {personalInsight.productRecommendations.map(
                                    (p: any, idx: number) => {
                                      const name =
                                        p?.name || "Recommended item";
                                      const rationale = p?.rationale || "";
                                      const url = p?.url;
                                      const important =
                                        idx === 0 ||
                                        /rationale|because|helps|support/i.test(
                                          rationale
                                        );
                                      return (
                                        <li
                                          key={`${idx}-${name}`}
                                          className={
                                            important
                                              ? "mt-1 rounded-md bg-emerald-50 px-1 py-0.5"
                                              : undefined
                                          }
                                        >
                                          {url ? (
                                            <a
                                              href={url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="font-medium underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700"
                                            >
                                              {name}
                                            </a>
                                          ) : (
                                            <span className="font-medium">
                                              {name}
                                            </span>
                                          )}
                                          {rationale ? ` — ${rationale}` : ""}
                                        </li>
                                      );
                                    }
                                  )}
                                </ul>
                              </div>
                            )}

                          {Array.isArray(personalInsight.practicalAdvice) &&
                            personalInsight.practicalAdvice.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-slate-900">
                                  Practical advice
                                </p>
                                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                                  {personalInsight.practicalAdvice.map(
                                    (a: string, idx: number) => {
                                      const important =
                                        idx === 0 ||
                                        /sleep|activity|nutrition|clinician|focus|repeat|timing|consistency/i.test(
                                          a || ""
                                        );
                                      return (
                                        <li
                                          key={`${idx}-${a}`}
                                          className={
                                            important
                                              ? "mt-1 rounded-md bg-yellow-50 px-1 py-0.5"
                                              : undefined
                                          }
                                        >
                                          {a}
                                        </li>
                                      );
                                    }
                                  )}
                                </ul>
                              </div>
                            )}

                          {Array.isArray(personalInsight.clinicianQuestions) &&
                            personalInsight.clinicianQuestions.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-slate-900">
                                  Questions for your clinician
                                </p>
                                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                                  {personalInsight.clinicianQuestions.map(
                                    (q: string, idx: number) => (
                                      <li
                                        key={`${idx}-${q}`}
                                        className={
                                          idx === 0
                                            ? "mt-1 rounded-md bg-rose-50 px-1 py-0.5"
                                            : undefined
                                        }
                                      >
                                        {q}
                                      </li>
                                    )
                                  )}
                                </ul>
                              </div>
                            )}

                          {personalInsight.disclaimer && (
                            <p className="text-xs text-slate-500">
                              {personalInsight.disclaimer}
                            </p>
                          )}
                        </div>
                      )}

                    {!personalInsightLoading &&
                      !personalInsightError &&
                      !personalInsight && (
                        <p className="mt-2 text-sm text-slate-700">
                          Personal insight will appear after the trend overlap loads.
                        </p>
                      )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        If high
                      </h3>
                      <p className="mt-1 text-sm text-slate-700">
                        {explanation.whatHighMeans}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        If low
                      </h3>
                      <p className="mt-1 text-sm text-slate-700">
                        {explanation.whatLowMeans}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        If borderline
                      </h3>
                      <p className="mt-1 text-sm text-slate-700">
                        {explanation.whatBorderlineMeans}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        In normal range
                      </h3>
                      <p className="mt-1 text-sm text-slate-700">
                        {explanation.normalMeans}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Practical notes
                    </h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                      {(explanation.practicalNotes ?? []).map((n, idx) => (
                        <li key={`${idx}-${n}`}>{n}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Questions for your clinician
                    </h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                      {(explanation.questionsForClinician ?? []).map((q, idx) => (
                        <li key={`${idx}-${q}`}>{q}</li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-xs text-slate-500">
                    {explanation.disclaimer}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
