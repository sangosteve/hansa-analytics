import { useState } from "react";
import { useLocation } from "wouter";
import {
  Building01Icon,
  ArrowReloadHorizontalIcon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  Menu01Icon,
  Settings01Icon,
} from "hugeicons-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCompany,
  COMPANY_OPTIONS,
  SCOPE_OPTIONS,
  type SaleScope,
} from "@/lib/company-context";
import { triggerDefaultRefresh } from "@/lib/api";
import { RefreshProgressDrawer } from "@/components/refresh/refresh-progress-drawer";
import { AdvancedRefreshModal } from "@/components/refresh/advanced-refresh-modal";

const ALL_VALUES = COMPANY_OPTIONS.map((c) => c.value);

const PAGE_TITLES: Record<string, string> = {
  "/":         "Sales Dashboard",
  "/movement": "Movement Analytics",
  "/settings": "Settings",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Date Range Picker ─────────────────────────────────────────────────────────
function DateRangePicker({ compact = false }: { compact?: boolean }) {
  const { dateFrom, dateTo, setDateRange, resetDateRange, isAllTime } = useCompany();

  const from = dateFrom ?? "";
  const to   = dateTo   ?? "";

  function handleFrom(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val && to && val <= to) setDateRange(val, to);
    else if (val) setDateRange(val, to || today());
  }

  function handleTo(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val && from && val >= from) setDateRange(from, val);
    else if (val) setDateRange(from || nDaysAgo(30), val);
  }

  const PRESETS = [
    { label: "Today", action: () => setDateRange(today(), today()) },
    { label: "7d",    action: () => setDateRange(nDaysAgo(7),   today()) },
    { label: "30d",   action: () => setDateRange(nDaysAgo(30),  today()) },
    { label: "90d",   action: () => setDateRange(nDaysAgo(90),  today()) },
    {
      label: "MTD",
      action: () => {
        const d = new Date(); d.setDate(1);
        setDateRange(d.toISOString().slice(0, 10), today());
      },
    },
    {
      label: "YTD",
      action: () => {
        const d = new Date(); d.setMonth(0); d.setDate(1);
        setDateRange(d.toISOString().slice(0, 10), today());
      },
    },
  ];

  const activePreset = (() => {
    if (isAllTime) return "All";
    const t = today();
    if (!from || !to) return null;
    if (from === t && to === t) return "Today";
    if (from === nDaysAgo(7) && to === t) return "7d";
    if (from === nDaysAgo(30) && to === t) return "30d";
    if (from === nDaysAgo(90) && to === t) return "90d";
    const d1 = new Date(); d1.setDate(1);
    if (from === d1.toISOString().slice(0, 10) && to === t) return "MTD";
    const d2 = new Date(); d2.setMonth(0); d2.setDate(1);
    if (from === d2.toISOString().slice(0, 10) && to === t) return "YTD";
    return null;
  })();

  if (compact) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-foreground">Date Range</p>
        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={from}
            onChange={handleFrom}
            className="h-9 px-3 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-full"
          />
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs">to</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <input
            type="date"
            value={to}
            onChange={handleTo}
            className="h-9 px-3 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-full"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={p.action}
              className={`h-7 px-2.5 text-xs rounded-md border font-medium transition-colors ${
                activePreset === p.label
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={resetDateRange}
            className={`h-7 px-2.5 text-xs rounded-md border font-medium transition-colors ${
              activePreset === "All"
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
            }`}
          >
            All
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55 leading-none">
        Date Range
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          onChange={handleFrom}
          className="h-7 px-2 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-[130px]"
        />
        <span className="text-muted-foreground text-xs flex-shrink-0">–</span>
        <input
          type="date"
          value={to}
          onChange={handleTo}
          className="h-7 px-2 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-[130px]"
        />
        <div className="flex items-center gap-1 ml-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={p.action}
              className={`h-6 px-2 text-[10px] rounded border font-medium transition-colors ${
                activePreset === p.label
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={resetDateRange}
            className={`h-6 px-2 text-[10px] rounded border font-medium transition-colors ${
              activePreset === "All"
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30"
            }`}
          >
            All
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Company selector (reusable) ───────────────────────────────────────────────
function CompanySelector({
  isAll, companyNos, onToggle,
}: {
  isAll: boolean;
  companyNos: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <button
        onClick={() => onToggle("all")}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
          isAll ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
        }`}
      >
        <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isAll ? "bg-primary border-primary" : "border-border"}`}>
          {isAll && <CheckmarkCircle01Icon size={10} className="text-primary-foreground" />}
        </div>
        All Companies
      </button>
      <div className="h-px bg-border" />
      {COMPANY_OPTIONS.map((co) => {
        const checked = !isAll && companyNos.includes(co.value);
        return (
          <button
            key={co.value}
            onClick={() => onToggle(co.value)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors ${
              checked ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
            }`}
          >
            <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
              {checked && <CheckmarkCircle01Icon size={10} className="text-primary-foreground" />}
            </div>
            {co.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
export default function TopBar({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const [location] = useLocation();
  const {
    companyNos, setCompanyNos,
    saleScope, setSaleScope,
    companyLabel,
  } = useCompany();

  const [companyOpen, setCompanyOpen]         = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const [jobId, setJobId]                     = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]           = useState(false);
  const [advancedOpen, setAdvancedOpen]       = useState(false);
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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

  const pageTitle = PAGE_TITLES[location] ?? "Hansa Analytics";

  return (
    <>
      <header className="flex-shrink-0 h-[60px] border-b border-border bg-card flex items-center px-3 md:px-5 gap-2 md:gap-4">

        {/* ── Mobile: hamburger ── */}
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu01Icon size={18} />
        </button>

        {/* ── Page title (visible on all sizes, truncates) ── */}
        <h1 className="font-semibold text-sm text-foreground truncate flex-shrink min-w-0 mr-auto md:mr-0">
          {pageTitle}
        </h1>

        {/* ── Desktop controls (hidden on mobile) ── */}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
          <DateRangePicker />

          <div className="h-6 w-px bg-border/60" />

          {/* Sale Type */}
          <div className="flex items-center rounded-lg border border-border bg-secondary overflow-hidden h-8">
            {SCOPE_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => setSaleScope(opt.value as SaleScope)}
                className={`
                  px-3 h-full text-xs font-medium transition-colors cursor-pointer
                  ${i < SCOPE_OPTIONS.length - 1 ? "border-r border-border" : ""}
                  ${saleScope === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-border/60" />

          {/* Company */}
          <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-medium min-w-[130px] max-w-[180px] justify-between gap-2"
              >
                <Building01Icon size={13} className="text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1 text-left">{companyLabel}</span>
                <ArrowDown01Icon size={12} className="text-muted-foreground flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1 bg-card border-border shadow-xl" align="end">
              <CompanySelector isAll={isAll} companyNos={companyNos} onToggle={toggleCompany} />
            </PopoverContent>
          </Popover>

          <div className="h-6 w-px bg-border/60" />
        </div>

        {/* ── Mobile: filter sheet button ── */}
        <button
          onClick={() => setMobileFiltersOpen(true)}
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors flex-shrink-0 relative"
          aria-label="Filters"
        >
          <Settings01Icon size={17} />
          {!isAll && (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>

        {/* ── Refresh Data (shown on all sizes) ── */}
        <div className="flex items-stretch rounded-lg overflow-hidden border border-primary/60 h-8 flex-shrink-0">
          <button
            onClick={handleDefaultRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2 md:px-3 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowReloadHorizontalIcon size={13} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{refreshing ? "Starting…" : "Refresh Data"}</span>
          </button>
          <Popover open={refreshMenuOpen} onOpenChange={setRefreshMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center px-1.5 border-l border-primary/40 bg-primary text-primary-foreground hover:opacity-80 transition-opacity cursor-pointer"
                aria-label="Refresh options"
              >
                <ArrowDown01Icon size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1 bg-card border-border shadow-xl" align="end">
              <button
                onClick={handleDefaultRefresh}
                className="w-full flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-md text-xs hover:bg-accent/20 transition-colors"
              >
                <span className="font-medium text-foreground">Refresh Data</span>
                <span className="text-[10px] text-muted-foreground">All active companies, default window</span>
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={() => { setRefreshMenuOpen(false); setAdvancedOpen(true); }}
                className="w-full flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-md text-xs hover:bg-accent/20 transition-colors"
              >
                <span className="font-medium text-foreground">Advanced Refresh…</span>
                <span className="text-[10px] text-muted-foreground">Choose companies, dates, components</span>
              </button>
              {jobId && (
                <>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => { setRefreshMenuOpen(false); setDrawerOpen(true); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                  >
                    View last refresh status
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* ── Mobile Filters Sheet ── */}
      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm">Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <DateRangePicker compact />

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Sale Type</p>
              <div className="flex rounded-lg border border-border bg-secondary overflow-hidden">
                {SCOPE_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    onClick={() => setSaleScope(opt.value as SaleScope)}
                    className={`
                      flex-1 py-2 text-xs font-medium transition-colors
                      ${i < SCOPE_OPTIONS.length - 1 ? "border-r border-border" : ""}
                      ${saleScope === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Company</p>
              <CompanySelector isAll={isAll} companyNos={companyNos} onToggle={toggleCompany} />
            </div>

            <Button
              className="w-full"
              size="sm"
              onClick={() => setMobileFiltersOpen(false)}
            >
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <RefreshProgressDrawer jobId={jobId} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <AdvancedRefreshModal open={advancedOpen} onClose={() => setAdvancedOpen(false)} onJobStarted={handleJobStarted} />
    </>
  );
}
