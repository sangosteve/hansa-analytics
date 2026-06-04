import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BarChart2, TrendingDown, Check, ChevronsUpDown, RefreshCw, Settings, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useCompany,
  COMPANY_OPTIONS,
  SCOPE_OPTIONS,
  DATE_PRESET_OPTIONS,
  type SaleScope,
  type DatePreset,
} from "@/lib/company-context";
import { triggerDefaultRefresh } from "@/lib/api";
import { RefreshProgressDrawer } from "@/components/refresh/refresh-progress-drawer";
import { AdvancedRefreshModal } from "@/components/refresh/advanced-refresh-modal";

const tabs = [
  { path: "/", label: "Sales Dashboard", icon: BarChart2 },
  { path: "/movement", label: "Movement Analytics", icon: TrendingDown },
];

const ALL_VALUES = COMPANY_OPTIONS.map((c) => c.value);

const LABEL = "text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55 leading-none select-none";

export default function NavBar() {
  const [location] = useLocation();
  const {
    companyNos, setCompanyNos,
    saleScope, setSaleScope,
    companyLabel,
    datePreset, setDatePreset,
    customFrom, customTo, isCustom,
    setCustomDates,
  } = useCompany();
  const [open, setOpen] = useState(false);

  // Refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);

  const isAll = companyNos.includes("all") || companyNos.length === ALL_VALUES.length || companyNos.length === 0;

  function toggleCompany(value: string) {
    if (value === "all") { setCompanyNos(["all"]); return; }
    const current = isAll ? [] : [...companyNos];
    const next = current.includes(value)
      ? current.filter((c) => c !== value)
      : [...current, value];
    setCompanyNos(next.length === 0 || next.length === ALL_VALUES.length ? ["all"] : next);
  }

  async function handleDefaultRefresh() {
    setRefreshMenuOpen(false);
    setRefreshing(true);
    try {
      const job = await triggerDefaultRefresh();
      setJobId(job.job_id);
      setDrawerOpen(true);
    } catch (e: any) {
      alert(e?.message ?? "Failed to start refresh");
    } finally {
      setRefreshing(false);
    }
  }

  function handleJobStarted(id: string) {
    setJobId(id);
    setDrawerOpen(true);
  }

  // Called when a refresh job completes successfully — nothing to do in nav,
  // pages that need to reload will detect the drawer close and re-query.

  const inputCls = (active: boolean) =>
    `h-[26px] px-2 text-[11px] rounded border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors w-[108px] ${
      active ? "border-primary/60" : "border-border text-muted-foreground"
    }`;

  return (
    <>
      <nav className="flex-shrink-0 border-b border-border bg-card flex items-stretch px-3 gap-0 h-[52px]">
        {/* Logo */}
        <div className="flex items-center pr-4 pl-1 mr-2 border-r border-border">
          <span className="text-xs font-bold tracking-tight text-foreground">Hansa</span>
        </div>

        {/* Page tabs */}
        {tabs.map((tab) => {
          const active = location === tab.path;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`flex items-center gap-1.5 px-3 text-xs font-medium h-full border-b-2 transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}

        {/* Settings tab */}
        <Link
          href="/settings"
          className={`flex items-center gap-1.5 px-3 text-xs font-medium h-full border-b-2 transition-colors ${
            location === "/settings"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>

        {/* ── Right-side filter groups ── */}
        <div className="ml-auto flex items-center gap-3 pr-1">

          {/* ── Date Range ── */}
          <div className="flex flex-col gap-[5px] justify-center">
            <span className={LABEL}>Date Range</span>
            <div className="flex items-center gap-1.5">
              {/* Presets */}
              <div className="flex items-center rounded-md border border-border bg-secondary overflow-hidden h-[26px]">
                {DATE_PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDatePreset(opt.value as DatePreset)}
                    className={`px-2 h-full text-[11px] font-medium transition-colors border-r border-border last:border-r-0 ${
                      !isCustom && datePreset === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <span className="text-border/60 text-xs select-none">·</span>

              {/* Custom from */}
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomDates(e.target.value, customTo)}
                className={inputCls(isCustom)}
              />
              <span className="text-muted-foreground/60 text-xs select-none">–</span>
              {/* Custom to */}
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomDates(customFrom, e.target.value)}
                className={inputCls(isCustom)}
              />
            </div>
          </div>

          <div className="h-8 w-px bg-border/50 mx-0.5" />

          {/* ── Sale Type ── */}
          <div className="flex flex-col gap-[5px] justify-center">
            <span className={LABEL}>Sale Type</span>
            <div className="flex items-center rounded-md border border-border bg-secondary overflow-hidden h-[26px]">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSaleScope(opt.value as SaleScope)}
                  className={`px-2.5 h-full text-[11px] font-medium transition-colors border-r border-border last:border-r-0 ${
                    saleScope === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-8 w-px bg-border/50 mx-0.5" />

          {/* ── Company ── */}
          <div className="flex flex-col gap-[5px] justify-center">
            <span className={LABEL}>Company</span>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button className="h-[26px] px-2.5 text-[11px] font-medium rounded border border-border bg-secondary text-foreground flex items-center gap-1.5 hover:bg-accent/30 transition-colors min-w-[120px] max-w-[180px] justify-between">
                  <span className="truncate">{companyLabel}</span>
                  <ChevronsUpDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1 bg-card border-border" align="end">
                <button
                  onClick={() => toggleCompany("all")}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    isAll ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
                  }`}
                >
                  <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isAll ? "bg-primary border-primary" : "border-border"}`}>
                    {isAll && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  All Companies
                </button>
                <div className="h-px bg-border my-1" />
                {COMPANY_OPTIONS.map((co) => {
                  const checked = !isAll && companyNos.includes(co.value);
                  return (
                    <button
                      key={co.value}
                      onClick={() => toggleCompany(co.value)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                        checked ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
                      }`}
                    >
                      <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                        {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      {co.label}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>

          <div className="h-8 w-px bg-border/50 mx-0.5" />

          {/* ── Refresh Data button ── */}
          <div className="flex items-center">
            <div className="flex items-stretch rounded-md overflow-hidden border border-border h-[26px]">
              {/* Main refresh button */}
              <button
                onClick={handleDefaultRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-2.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Starting…" : "Refresh Data"}
              </button>
              {/* Dropdown trigger */}
              <Popover open={refreshMenuOpen} onOpenChange={setRefreshMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center px-1.5 border-l border-primary/40 bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
                    aria-label="Refresh options"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1 bg-card border-border" align="end">
                  <button
                    onClick={handleDefaultRefresh}
                    className="w-full flex flex-col items-start gap-0.5 px-2.5 py-2 rounded text-xs hover:bg-accent/20 transition-colors"
                  >
                    <span className="font-medium text-foreground">Refresh Data</span>
                    <span className="text-[10px] text-muted-foreground">All active companies, default window</span>
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => { setRefreshMenuOpen(false); setAdvancedOpen(true); }}
                    className="w-full flex flex-col items-start gap-0.5 px-2.5 py-2 rounded text-xs hover:bg-accent/20 transition-colors"
                  >
                    <span className="font-medium text-foreground">Advanced Refresh…</span>
                    <span className="text-[10px] text-muted-foreground">Choose companies, dates, components</span>
                  </button>
                  {jobId && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <button
                        onClick={() => { setRefreshMenuOpen(false); setDrawerOpen(true); }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                      >
                        View last refresh status
                      </button>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

        </div>
      </nav>

      {/* Refresh progress drawer */}
      <RefreshProgressDrawer
        jobId={jobId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Advanced refresh modal */}
      <AdvancedRefreshModal
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        onJobStarted={handleJobStarted}
      />
    </>
  );
}
