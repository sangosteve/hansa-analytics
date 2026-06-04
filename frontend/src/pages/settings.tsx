import { useEffect, useState } from "react";
import {
  getRefreshSettings,
  updateRefreshSettings,
  getRefreshHistory,
  type RefreshSettings,
  type RefreshHistoryRow,
} from "@/lib/api";
import { CheckCircle2, XCircle, Clock, Settings2, History } from "lucide-react";

const ALL_COMPANIES = [
  { value: "3", label: "Retail (Co. 3)" },
  { value: "4", label: "Manufacturing (Co. 4)" },
  { value: "5", label: "Engineering (Co. 5)" },
  { value: "6", label: "Mining (Co. 6)" },
];

const REFRESH_MODES = [
  {
    value: "last_success_buffer",
    label: "Last success minus buffer",
    desc: "Picks up from the last successful refresh, minus a safety buffer",
  },
  {
    value: "last_n_days",
    label: "Last N days",
    desc: "Always refresh the last N days of data",
  },
  {
    value: "current_month",
    label: "Current month",
    desc: "Refresh from the 1st of the current month",
  },
  {
    value: "ytd",
    label: "Year to date",
    desc: "Refresh from January 1st of the current year",
  },
];

const BUFFER_OPTIONS = [2, 7, 14, 30];

type Tab = "config" | "history";

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "success" || s === "ok" || s === "done")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> {status}
      </span>
    );
  if (s === "error" || s === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400">
        <XCircle className="h-3 w-3" /> {status}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
      <Clock className="h-3 w-3" /> {status}
    </span>
  );
}

function formatDt(dt: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function duration(a: string | null, b: string | null) {
  if (!a || !b) return "—";
  const secs = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-1">
      <div
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative h-5 w-9 rounded-full flex-shrink-0 transition-colors ${
          checked ? "bg-primary" : "bg-secondary border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </div>
      <div>
        <span className="text-xs font-medium text-foreground">{label}</span>
        {desc && <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>}
      </div>
    </label>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("config");
  const [settings, setSettings] = useState<RefreshSettings | null>(null);
  const [draft, setDraft] = useState<RefreshSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<RefreshHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getRefreshSettings()
      .then((s) => { setSettings(s); setDraft(s); })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (tab === "history") {
      setHistoryLoading(true);
      getRefreshHistory(100)
        .then(setHistory)
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    }
  }, [tab]);

  function set<K extends keyof RefreshSettings>(key: K, value: RefreshSettings[K]) {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function toggleCompany(val: string) {
    if (!draft) return;
    const current = draft.active_companies ?? [];
    const next = current.includes(val)
      ? current.filter((c) => c !== val)
      : [...current, val];
    set("active_companies", next.length === 0 ? ["3", "4", "5", "6"] : next);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateRefreshSettings(draft);
      setSettings(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const tabCls = (t: Tab) =>
    `flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
    }`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header with tabs */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 h-11 flex items-stretch gap-0">
        <div className="flex items-center pr-4 mr-2 border-r border-border">
          <span className="text-xs font-semibold text-foreground">Settings</span>
        </div>
        <button className={tabCls("config")} onClick={() => setTab("config")}>
          <Settings2 className="h-3.5 w-3.5" />
          Data Refresh
        </button>
        <button className={tabCls("history")} onClick={() => setTab("history")}>
          <History className="h-3.5 w-3.5" />
          Refresh History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Config Tab */}
        {tab === "config" && (
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-8">
            {loadError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                {loadError}
              </div>
            )}

            {!draft && !loadError && (
              <div className="text-xs text-muted-foreground">Loading settings...</div>
            )}

            {draft && (
              <>
                {/* Active companies */}
                <section>
                  <h2 className="text-xs font-semibold text-foreground mb-0.5">Active Companies</h2>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Companies included in the default refresh. Dashboard filters are separate — selecting a company here affects what data gets synced, not what you view.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_COMPANIES.map((co) => {
                      const active = draft.active_companies?.includes(co.value);
                      return (
                        <button
                          key={co.value}
                          onClick={() => toggleCompany(co.value)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left text-xs transition-colors ${
                            active
                              ? "border-primary/60 bg-primary/5 text-foreground"
                              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/20"
                          }`}
                        >
                          <div
                            className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              active ? "bg-primary border-primary" : "border-border"
                            }`}
                          >
                            {active && (
                              <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          {co.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="h-px bg-border" />

                {/* Refresh mode */}
                <section>
                  <h2 className="text-xs font-semibold text-foreground mb-0.5">Default Refresh Window</h2>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    How the date range is calculated when you click Refresh Data.
                  </p>
                  <div className="space-y-2">
                    {REFRESH_MODES.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => set("refresh_mode", m.value as RefreshSettings["refresh_mode"])}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
                          draft.refresh_mode === m.value
                            ? "border-primary/60 bg-primary/5"
                            : "border-border bg-card hover:bg-accent/20"
                        }`}
                      >
                        <div
                          className={`mt-0.5 h-3.5 w-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            draft.refresh_mode === m.value ? "border-primary" : "border-border"
                          }`}
                        >
                          {draft.refresh_mode === m.value && (
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{m.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Safety buffer (only shown for last_success_buffer mode) */}
                {draft.refresh_mode === "last_success_buffer" && (
                  <>
                    <div className="h-px bg-border" />
                    <section>
                      <h2 className="text-xs font-semibold text-foreground mb-0.5">Safety Buffer</h2>
                      <p className="text-[11px] text-muted-foreground mb-3">
                        Days subtracted from the last successful refresh date to catch any late-arriving records.
                      </p>
                      <div className="flex gap-2">
                        {BUFFER_OPTIONS.map((n) => (
                          <button
                            key={n}
                            onClick={() => set("safety_buffer_days", n)}
                            className={`h-8 px-4 rounded-md border text-xs font-medium transition-colors ${
                              draft.safety_buffer_days === n
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
                            }`}
                          >
                            {n} days
                          </button>
                        ))}
                      </div>
                    </section>
                  </>
                )}

                {/* Last N days (only shown for last_n_days mode) */}
                {draft.refresh_mode === "last_n_days" && (
                  <>
                    <div className="h-px bg-border" />
                    <section>
                      <h2 className="text-xs font-semibold text-foreground mb-0.5">Number of Days</h2>
                      <p className="text-[11px] text-muted-foreground mb-3">
                        How many days back from today to include in each refresh.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={730}
                          value={draft.last_n_days}
                          onChange={(e) => set("last_n_days", parseInt(e.target.value, 10) || 30)}
                          className="h-8 w-24 px-2 text-xs rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <span className="text-xs text-muted-foreground">days</span>
                        <div className="flex gap-1.5">
                          {[7, 14, 30, 60, 90].map((n) => (
                            <button
                              key={n}
                              onClick={() => set("last_n_days", n)}
                              className="h-6 px-2 text-[10px] rounded border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                            >
                              {n}d
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  </>
                )}

                <div className="h-px bg-border" />

                {/* Components */}
                <section>
                  <h2 className="text-xs font-semibold text-foreground mb-0.5">Refresh Components</h2>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Choose which data types are included in the default refresh.
                  </p>
                  <div className="space-y-1">
                    <Toggle
                      checked={draft.include_master}
                      onChange={(v) => set("include_master", v)}
                      label="Master Data"
                      desc="Items, item groups, and customers from Hansa master company"
                    />
                    <Toggle
                      checked={draft.include_invoices}
                      onChange={(v) => set("include_invoices", v)}
                      label="Invoices"
                      desc="Source invoice headers and lines"
                    />
                    <Toggle
                      checked={draft.include_deliveries}
                      onChange={(v) => set("include_deliveries", v)}
                      label="Deliveries"
                      desc="Source delivery headers and lines"
                    />
                    <Toggle
                      checked={draft.rebuild_facts}
                      onChange={(v) => set("rebuild_facts", v)}
                      label="Sales Facts"
                      desc="Rebuild the fact_sales_lines analytics table from source data"
                    />
                    <Toggle
                      checked={draft.rebuild_movement}
                      onChange={(v) => set("rebuild_movement", v)}
                      label="Customer Movement"
                      desc="Rebuild buying pattern and action band summaries"
                    />
                    <Toggle
                      checked={draft.rebuild_stock}
                      onChange={(v) => set("rebuild_stock", v)}
                      label="Stock Status"
                      desc="Snapshot current stock levels from Hansa (slower — runs per company)"
                    />
                  </div>
                </section>

                {/* Save button */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className="h-8 px-5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                  {saved && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                  {!isDirty && !saved && (
                    <span className="text-[11px] text-muted-foreground">No unsaved changes</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xs font-semibold text-foreground">Refresh History</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Recent data sync runs from the database</p>
              </div>
              <button
                onClick={() => {
                  setHistoryLoading(true);
                  getRefreshHistory(100).then(setHistory).catch(() => {}).finally(() => setHistoryLoading(false));
                }}
                className="h-7 px-3 rounded border border-border bg-secondary text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
              >
                Reload
              </button>
            </div>

            {historyLoading && (
              <div className="text-xs text-muted-foreground py-8 text-center">Loading history...</div>
            )}

            {!historyLoading && history.length === 0 && (
              <div className="text-xs text-muted-foreground py-8 text-center">No refresh runs recorded yet.</div>
            )}

            {!historyLoading && history.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-card/60">
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">ID</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Status</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Company</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Date Range</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Records</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Started</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {history.map((row) => (
                      <tr key={row.id} className="hover:bg-accent/10 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground">#{row.id}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-2 text-foreground/70">{row.company_no}</td>
                        <td className="px-3 py-2 text-foreground/70">
                          {row.date_from && row.date_to ? `${row.date_from} → ${row.date_to}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground/70">
                          {row.records_processed?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground/70">{formatDt(row.started_at)}</td>
                        <td className="px-3 py-2 text-foreground/70">{duration(row.started_at, row.finished_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
