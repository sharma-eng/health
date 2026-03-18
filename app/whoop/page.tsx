"use client";

import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type WhoopResponse = {
  provider: string;
  status: string;
  message?: string;
  raw?: any;
};

export default function WhoopPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WhoopResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [providers, setProviders] = useState<any[] | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const endDefault = new Date();
  const startDefault = new Date(endDefault);
  startDefault.setDate(startDefault.getDate() - 30);
  const [startDate, setStartDate] = useState(startDefault.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(endDefault.toISOString().slice(0, 10));

  async function loadHistory(rangeStart: string, rangeEnd: string) {
    setHistoryLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const url = new URL(`${API_BASE}/api/wearables/whoop`);
      url.searchParams.set("start_date", rangeStart);
      url.searchParams.set("end_date", rangeEnd);

      const res = await fetch(url.toString());
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.message || json.error || "Failed to load WHOOP history";
        setErrorDetails(json.details || null);
        throw new Error(msg);
      }
      setData(json as WhoopResponse);
    } catch (e: any) {
      setError(e.message || "Failed to load WHOOP history");
    } finally {
      setHistoryLoading(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadProviders() {
      setProvidersLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/wearables/junction/providers`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load providers");
        setProviders(json.providers || []);
      } catch (e: any) {
        setProviders([]);
      } finally {
        setProvidersLoading(false);
      }
    }
    loadProviders();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/wearables/junction/refresh`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to refresh");
      // Wait briefly, then re-fetch data.
      await new Promise((r) => setTimeout(r, 2000));
      const whoopRes = await fetch(`${API_BASE}/api/wearables/whoop`);
      const whoopJson = await whoopRes.json();
      if (!whoopRes.ok) throw new Error(whoopJson.error || "Failed to reload WHOOP");
      setData(whoopJson as WhoopResponse);
    } catch (e: any) {
      setError(e.message || "Failed to refresh WHOOP");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleConnect() {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/wearables/link-token`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.details || json.error || "Failed to generate link");
      }

      if (!json.link_web_url) {
        throw new Error("Junction did not return link_web_url");
      }

      // Launch the hosted Junction Link widget.
      window.open(json.link_web_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e.message || "Failed to open Junction Link");
    } finally {
      setRefreshing(false);
    }
  }

  const raw = data?.raw || {};
  const sleepList = Array.isArray(raw?.sleep?.sleep)
    ? raw.sleep.sleep
    : Array.isArray(raw?.sleep)
      ? raw.sleep
      : [];
  const activityList = Array.isArray(raw?.activity?.activity)
    ? raw.activity.activity
    : Array.isArray(raw?.activity)
      ? raw.activity
      : [];
  const latestActivity = activityList[activityList.length - 1];
  const latestSleep = sleepList[sleepList.length - 1];
  const sleepHours =
    latestSleep?.total != null
      ? (latestSleep.total / 3600).toFixed(1)
      : latestSleep?.total_sleep_duration != null
        ? (latestSleep.total_sleep_duration / 3600).toFixed(1)
        : null;
  const isEmpty = sleepList.length === 0 && activityList.length === 0;

  const sleepChart = sleepList
    .map((s: any) => {
      const d = s.calendar_date || (typeof s.date === "string" ? s.date.slice(0, 10) : null);
      if (!d) return null;
      const hours =
        s.total != null
          ? s.total / 3600
          : s.total_sleep_duration != null
            ? s.total_sleep_duration / 3600
            : null;
      return { date: d, hours };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

  const activityChart = activityList
    .map((a: any) => {
      const d =
        a.calendar_date || (typeof a.date === "string" ? a.date.slice(0, 10) : null);
      if (!d) return null;
      return { date: d, steps: a.steps ?? null };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

  return (
    <main className="flex flex-1 flex-col gap-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-balance bg-gradient-to-r from-emerald-400 via-sky-300 to-indigo-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          WHOOP Data
        </h1>
        <p className="max-w-2xl text-sm text-slate-300/80 sm:text-base">
          Live WHOOP data pulled via Junction Health for your configured
          Junction user.
        </p>
      </header>

      <section className="glass-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-300/85">
            Backend endpoint: <code className="text-[10px]">/api/wearables/whoop</code>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConnect}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-4 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-indigo-500/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {refreshing ? "Please wait…" : "Connect WHOOP"}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {refreshing ? "Working…" : "Refresh WHOOP"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-xs text-slate-300/85">
          {loading && <p className="text-xs text-slate-300/85">Loading WHOOP data…</p>}
          {error && !loading && (
            <p className="text-xs font-medium text-rose-300">{error}</p>
          )}
          {error && errorDetails && !loading && (
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-900/80 p-3 text-[10px] text-rose-200">
              {JSON.stringify(errorDetails, null, 2)}
            </pre>
          )}

          {!loading && !error && data && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {data.provider.toUpperCase()}
                </p>
                <p className="mt-1 text-[11px] text-emerald-300">
                  Status: {data.status}
                </p>
                {data.message && (
                  <p className="mt-2 text-xs text-slate-300/90">
                    {data.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="mb-1 block text-[10px] text-slate-400">
                    Start date
                  </label>
                  <input
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    type="date"
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-900/40 px-2 py-1 text-xs text-slate-200 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-slate-400">
                    End date
                  </label>
                  <input
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    type="date"
                    className="w-full rounded-xl border border-slate-800/80 bg-slate-900/40 px-2 py-1 text-xs text-slate-200 outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => loadHistory(startDate, endDate)}
                    disabled={historyLoading}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-4 py-2 text-xs font-medium text-slate-950 shadow-lg shadow-indigo-500/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                  >
                    {historyLoading ? "Loading…" : "Load history"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  CONNECTED PROVIDERS
                </p>
                <p className="mt-1 text-xs text-slate-300/80">
                  {providersLoading ? "Loading…" : null}
                  {!providersLoading && (!providers || providers.length === 0)
                    ? "No providers found for this Junction user."
                    : null}
                </p>
                {!providersLoading && providers && providers.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {providers.map((p: any) => (
                      <li key={p.slug}>
                        <span className="font-medium text-slate-200">{p.name}</span>{" "}
                        <span className="text-slate-400">({p.slug})</span>{" "}
                        <span className="text-slate-500">- {p.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {isEmpty && (
                <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200/90">
                  <p className="font-medium">No sleep or activity data yet</p>
                  <p className="mt-1 text-slate-300/80">
                    Connect WHOOP for your Junction user via Junction Link, then wait a few minutes for the first sync. Use the &quot;Connect WHOOP&quot; button on the Wearables page to get the link.
                  </p>
                </div>
              )}

              {!isEmpty && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Sleep hours (history)
                    </p>
                    <div className="mt-2 h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sleepChart}>
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
                            dataKey="hours"
                            stroke="#22c55e"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Steps (history)
                    </p>
                    <div className="mt-2 h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activityChart}>
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
                            dataKey="steps"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    SLEEP (last night)
                  </p>
                  <p className="mt-1 text-lg font-semibold text-indigo-300">
                    {sleepHours != null ? `${sleepHours}h` : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    STEPS (today)
                  </p>
                  <p className="mt-1 text-lg font-semibold text-sky-300">
                    {latestActivity?.steps ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    SLEEP RECORDS
                  </p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">
                    {sleepList.length}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  RAW PAYLOAD
                </p>
                <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950/80 p-3 text-[10px] text-slate-200">
                  {JSON.stringify(raw, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {!loading && !error && !data && (
            <p className="text-xs text-slate-300/85">
              No WHOOP data yet. Make sure your Junction user is connected to
              WHOOP via Junction Link and data has finished syncing.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

