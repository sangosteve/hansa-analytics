import { useEffect, useState } from "react";
import {
  getRefreshSettings,
  updateRefreshSettings,
  getRefreshHistory,
  getOAuthStatus,
  getOAuthConfig,
  getOAuthStartUrl,
  disconnectOAuth,
  testHansaConnection,
  type RefreshSettings,
  type RefreshHistoryRow,
  type OAuthStatus,
  type OAuthConfig,
  type ConnectionTestResult,
} from "@/lib/api";
import {
  CheckmarkCircle01Icon,
  CancelCircleIcon,
  Clock01Icon,
  Settings01Icon,
  Clock04Icon,
  Plug01Icon as PlugInIcon,
  LinkSquare01Icon,
  AlertCircleIcon,
} from "hugeicons-react";

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

type Tab = "config" | "history" | "integrations";

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "success" || s === "ok" || s === "done")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
        <CheckmarkCircle01Icon size={12} /> {status}
      </span>
    );
  if (s === "error" || s === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400">
        <CancelCircleIcon size={12} /> {status}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
      <Clock01Icon size={12} /> {status}
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

// ── Integrations Tab ──────────────────────────────────────────────────────────

function OAuthStatusPill({ status }: { status: OAuthStatus["status"] }) {
  if (status === "connected")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><CheckmarkCircle01Icon size={11} />Connected</span>;
  if (status === "expired")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400"><AlertCircleIcon size={11} />Token Expired</span>;
  if (status === "not_connected")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><CancelCircleIcon size={11} />Not Connected</span>;
  if (status === "error")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400"><CancelCircleIcon size={11} />Error</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Clock01Icon size={11} />{status}</span>;
}

function IntegrationsTab() {
  const [oauthStatus, setOauthStatus]     = useState<OAuthStatus | null>(null);
  const [oauthConfig, setOauthConfig]     = useState<OAuthConfig | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting]             = useState(false);
  const [testResult, setTestResult]       = useState<ConnectionTestResult | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    setActionError(null);
    try {
      const [s, cfg] = await Promise.all([getOAuthStatus(), getOAuthConfig()]);
      setOauthStatus(s);
      setOauthConfig(cfg);
    } catch (e: any) {
      setActionError(e.message ?? "Failed to load status");
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Handle redirect back from OAuth (e.g. ?oauth_connected=1)
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_connected")) {
      window.history.replaceState({}, "", window.location.pathname);
      loadStatus();
    }
    if (params.get("oauth_error")) {
      const code = params.get("oauth_error");
      const desc = params.get("oauth_error_desc");
      const messages: Record<string, string> = {
        not_started:    "OAuth flow was not started properly. Please click \"Connect Hansa\" to begin.",
        missing_code:   "Authorization was not completed — no code was received from Hansa. Please try again.",
        missing_state:  "Authorization was not completed — state parameter missing (possible CSRF). Please try again.",
        access_denied:  "Authorization was denied. Please try again and approve the Hansa connection.",
        wrong_redirect: "Hansa rejected the authorization request.",
      };
      const base = messages[code!] ?? `OAuth error: ${code}`;
      // Append the raw description from Hansa so the exact reason is visible
      setActionError(desc ? `${base} Hansa says: "${desc}"` : base);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnect = () => {
    setConnecting(true);
    setActionError(null);
    setTestResult(null);
    // Navigate the browser directly to the backend /start route.
    // The backend immediately redirects to the Hansa authorization page.
    const returnUrl = window.location.href.split("?")[0];
    window.location.href = getOAuthStartUrl(returnUrl);
  };

  const handleDisconnect = async () => {
    if (!confirm("This will remove the stored Hansa OAuth token. Refresh jobs will fail until you reconnect.")) return;
    setDisconnecting(true);
    setActionError(null);
    setTestResult(null);
    try {
      await disconnectOAuth();
      await loadStatus();
    } catch (e: any) {
      setActionError(e.message ?? "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setActionError(null);
    try {
      const result = await testHansaConnection();
      setTestResult(result);
    } catch (e: any) {
      setActionError(e.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const isOAuth = oauthStatus?.auth_mode === "oauth";
  const isConnected = oauthStatus?.status === "connected";
  const isExpired = oauthStatus?.status === "expired";

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-xs font-semibold text-foreground">Integrations</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Manage connections to external systems used for data sync.
        </p>
      </div>

      {actionError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 flex items-start gap-2">
          <CancelCircleIcon size={14} className="flex-shrink-0 mt-0.5" />
          {actionError}
        </div>
      )}

      {/* Hansa ERP card */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <LinkSquare01Icon size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Hansa ERP / StandardID</p>
              <p className="text-[10px] text-muted-foreground">HansaWorld Standard ERP — OAuth2 via standard-id.hansaworld.com</p>
            </div>
          </div>
          {statusLoading ? (
            <span className="text-[10px] text-muted-foreground animate-pulse">Loading…</span>
          ) : oauthStatus ? (
            <OAuthStatusPill status={oauthStatus.status} />
          ) : null}
        </div>

        {/* Card body */}
        <div className="px-4 py-4 space-y-4">
          {/* Auth mode info */}
          {oauthStatus && (
            <div className="flex gap-4 text-[11px]">
              <div>
                <span className="text-muted-foreground">Auth mode: </span>
                <span className="font-medium text-foreground">
                  {oauthStatus.auth_mode === "oauth" ? "OAuth 2.0" : "Basic Auth"}
                </span>
              </div>
              {isConnected && oauthStatus.expires_at && (
                <div>
                  <span className="text-muted-foreground">Token expires: </span>
                  <span className="font-medium text-foreground">{formatDt(oauthStatus.expires_at)}</span>
                </div>
              )}
              {isConnected && oauthStatus.last_connected && (
                <div>
                  <span className="text-muted-foreground">Last connected: </span>
                  <span className="font-medium text-foreground">{formatDt(oauthStatus.last_connected)}</span>
                </div>
              )}
              {isConnected && oauthStatus.scope && (
                <div>
                  <span className="text-muted-foreground">Scope: </span>
                  <span className="font-medium text-foreground">{oauthStatus.scope}</span>
                </div>
              )}
            </div>
          )}

          {/* Non-OAuth mode note */}
          {oauthStatus && !isOAuth && (
            <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
              Currently using Basic Auth (<code>HANSA_AUTH_MODE=basic</code>). Set <code>HANSA_AUTH_MODE=oauth</code> to enable OAuth2 sign-in.
            </div>
          )}

          {/* Status description */}
          {oauthStatus?.message && (
            <p className="text-[11px] text-muted-foreground">{oauthStatus.message}</p>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`text-[11px] rounded px-3 py-2 border ${testResult.ok ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
              <div className="flex items-center gap-1.5 font-semibold">
                {testResult.ok ? <CheckmarkCircle01Icon size={13} /> : <CancelCircleIcon size={13} />}
                {testResult.ok ? "Connection successful" : "Connection failed"}
              </div>
              <p className="mt-1 opacity-80">{testResult.message}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {isOAuth && !isConnected && !isExpired && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center gap-1.5 h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <PlugInIcon size={13} />
                {connecting ? "Redirecting…" : "Connect Hansa"}
              </button>
            )}

            {isOAuth && (isConnected || isExpired) && (
              <>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <PlugInIcon size={13} />
                  {connecting ? "Redirecting…" : "Reconnect"}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </>
            )}

            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test Connection"}
            </button>

            <button
              onClick={loadStatus}
              disabled={statusLoading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-50"
            >
              Refresh Status
            </button>
          </div>
        </div>

        {/* Setup instructions (collapsed when connected) */}
        {!isConnected && isOAuth && (
          <details className="group">
            <summary className="px-4 py-2.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer select-none border-t border-border bg-secondary/20 list-none flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Setup instructions
            </summary>
            <div className="px-4 py-3 border-t border-border bg-secondary/10 text-[11px] text-muted-foreground space-y-2">
              <p>To connect Hansa ERP via OAuth2:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-2">
                <li>Register a Developer App at <strong>MyStandard</strong> (standard-id.hansaworld.com) with the redirect URI set to your backend callback URL (shown below)</li>
                <li>Set environment variables: <code className="bg-secondary px-1 rounded">HANSA_AUTH_MODE=oauth</code>, <code className="bg-secondary px-1 rounded">HANSA_OAUTH_CLIENT_ID</code>, <code className="bg-secondary px-1 rounded">HANSA_OAUTH_CLIENT_SECRET</code>, <code className="bg-secondary px-1 rounded">HANSA_OAUTH_REDIRECT_URI</code></li>
                <li>Click <strong>Connect Hansa</strong> above and sign in via StandardID</li>
                <li>After authorizing, you will be redirected back here automatically</li>
              </ol>
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-medium text-foreground">Callback URL to register in Hansa developer portal:</p>
                {oauthConfig?.callback_url ? (
                  <code className="block bg-secondary px-2 py-1 rounded text-[10px] break-all">{oauthConfig.callback_url}</code>
                ) : (
                  <code className="block bg-secondary px-2 py-1 rounded text-[10px] text-amber-400">
                    Not configured — set HANSA_OAUTH_REDIRECT_URI to your backend URL + /api/hansa/oauth/callback
                  </code>
                )}
                <p className="text-[10px] text-amber-400/80">
                  ⚠ This URL must match <em>exactly</em> what is registered in your StandardID developer app — any mismatch causes the <code className="bg-secondary px-0.5 rounded">wrong_redirect</code> error.
                </p>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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
          <Settings01Icon size={14} />
          Data Refresh
        </button>
        <button className={tabCls("history")} onClick={() => setTab("history")}>
          <Clock04Icon size={14} />
          Refresh History
        </button>
        <button className={tabCls("integrations")} onClick={() => setTab("integrations")}>
          <PlugInIcon size={14} />
          Integrations
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

                <div className="h-px bg-border" />

                {/* Scheduled Refresh */}
                <section>
                  <h2 className="text-xs font-semibold text-foreground mb-0.5">Scheduled Refresh</h2>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Automatically refresh data on a schedule. Uses the same pipeline and components selected above.
                  </p>
                  <div className="space-y-4">
                    <Toggle
                      checked={draft.schedule_enabled ?? false}
                      onChange={(v) => set("schedule_enabled", v)}
                      label="Enable Scheduled Refresh"
                      desc="Run the refresh pipeline automatically — no manual trigger required"
                    />

                    {draft.schedule_enabled && (
                      <>
                        {/* Frequency */}
                        <div>
                          <p className="text-[11px] font-medium text-foreground mb-2">Frequency</p>
                          <div className="flex gap-2">
                            {(["daily", "weekly", "monthly"] as const).map((freq) => (
                              <button
                                key={freq}
                                onClick={() => set("schedule_frequency", freq)}
                                className={`h-8 px-4 rounded-md border text-xs font-medium capitalize transition-colors ${
                                  draft.schedule_frequency === freq
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
                                }`}
                              >
                                {freq}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Time */}
                        <div>
                          <p className="text-[11px] font-medium text-foreground mb-2">Refresh Time <span className="font-normal text-muted-foreground">(server UTC)</span></p>
                          <div className="flex items-center gap-3">
                            <input
                              type="time"
                              value={draft.schedule_time ?? "02:00"}
                              onChange={(e) => set("schedule_time", e.target.value)}
                              className="h-8 px-2 text-xs rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            <div className="flex gap-1.5">
                              {["00:00", "02:00", "04:00", "06:00"].map((t) => (
                                <button
                                  key={t}
                                  onClick={() => set("schedule_time", t)}
                                  className={`h-6 px-2 text-[10px] rounded border transition-colors ${
                                    draft.schedule_time === t
                                      ? "border-primary/60 bg-primary/10 text-primary"
                                      : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Default is 02:00 AM UTC — off-peak, before the business day starts.
                          </p>
                        </div>
                      </>
                    )}
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
                      <CheckmarkCircle01Icon size={14} /> Saved
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
                <table className="w-full text-[11px] min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border bg-card/60">
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Status</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Trigger</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Companies</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Date Range</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Records</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Started</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {history.map((row) => (
                      <tr key={row.id} className="hover:bg-accent/10 transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={row.status} />
                            {row.error_count > 0 && (
                              <span className="text-[9px] text-red-400">{row.error_count} error{row.error_count > 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            row.trigger_type === "scheduled"
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-muted-foreground"
                          }`}>
                            {row.trigger_type === "scheduled" ? "⏱ Scheduled" : "Manual"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-foreground/70">
                          {row.companies?.length ? row.companies.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground/70">
                          {row.date_from && row.date_to ? `${row.date_from} → ${row.date_to}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground/70">
                          {row.total_records?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground/70">{formatDt(row.started_at)}</td>
                        <td className="px-3 py-2 text-foreground/70">
                          {row.duration_secs != null
                            ? row.duration_secs < 60
                              ? `${row.duration_secs}s`
                              : `${Math.floor(row.duration_secs / 60)}m ${row.duration_secs % 60}s`
                            : duration(row.started_at, row.finished_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Integrations Tab */}
        {tab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}
