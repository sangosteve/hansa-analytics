import { useState, useRef, useEffect } from "react";
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
import { getPeriodPresets, PERIOD_GROUPS, computeActivePeriod } from "@/lib/period-utils";

const ALL_VALUES = COMPANY_OPTIONS.map((c) => c.value);

const PAGE_TITLES: Record<string, string> = {
  "/":         "Sales Dashboard",
  "/movement": "Movement Analytics",
  "/settings": "Settings",
};

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayISO(): string { return localISO(new Date()); }
function nDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return localISO(d);
}

// ── Period Dropdown ───────────────────────────────────────────────────────────
function PeriodDropdown({
  activePeriod,
  onSelect,
  compact = false,
}: {
  activePeriod: string;
  onSelect: (label: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isCustom = activePeriod.startsWith("Custom Range");

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${compact ? "w-full" : "flex-shrink-0"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 font-medium transition-colors ${
          compact
            ? "w-full justify-between h-9 px-3 rounded-md border border-primary/40 bg-primary/10 text-primary text-xs"
            : "h-7 px-2.5 rounded border border-primary/40 bg-primary/10 text-primary text-[10.5px] min-w-[130px] max-w-[200px]"
        }`}
      >
        <span className="truncate flex-1 text-left">{activePeriod}</span>
        <ArrowDown01Icon
          size={compact ? 12 : 11}
          className={`flex-shrink-0 text-primary/70 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className={`absolute z-50 rounded-lg border border-border bg-card shadow-xl py-1 max-h-80 overflow-y-auto ${
            compact ? "left-0 right-0 top-10" : "right-0 top-8 min-w-[200px]"
          }`}
        >
          {PERIOD_GROUPS.map((g, gi) => (
            <div key={g.group}>
              <div
                className={`px-3 py-1 text-[9px] uppercase tracking-widest text-muted-foreground/50 font-semibold ${
                  gi > 0 ? "border-t border-border/40 mt-0.5 pt-1.5" : ""
                }`}
              >
                {g.group}
              </div>
              {g.items.map((item) => {
                const isActive = activePeriod === item || (item === "Custom Range" && isCustom);
                return (
                  <button
                    key={item}
                    onClick={() => { onSelect(item); setOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                      isActive
                        ? "text-primary font-semibold bg-primary/5"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Date Range Picker ─────────────────────────────────────────────────────────
function DateRangePicker({ compact = false }: { compact?: boolean }) {
  const { dateFrom, dateTo, setDateRange, resetDateRange } = useCompany();

  const from = dateFrom ?? "";
  const to   = dateTo   ?? "";

  const activePeriod = computeActivePeriod(from, to);

  function handleFrom(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val && to && val <= to) setDateRange(val, to);
    else if (val) setDateRange(val, to || todayISO());
  }

  function handleTo(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val && from && val >= from) setDateRange(from, val);
    else if (val) setDateRange(from || nDaysAgo(29), val);
  }

  function handleSelectPeriod(label: string) {
    if (label === "Custom Range") return;
    if (label === "All Time") { resetDateRange(); return; }
    const presets = getPeriodPresets();
    const preset = presets[label];
    if (preset) setDateRange(preset.from, preset.to);
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-foreground">Date Range</p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">From</span>
            <input
              type="date" value={from} onChange={handleFrom}
              className="h-9 px-3 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">To</span>
            <input
              type="date" value={to} onChange={handleTo}
              className="h-9 px-3 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-full"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Period</span>
          <PeriodDropdown activePeriod={activePeriod} onSelect={handleSelectPeriod} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55 leading-none">
          Date Range
        </p>
        <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55 leading-none">
          Period
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date" value={from} onChange={handleFrom}
          className="h-7 px-2 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-[118px]"
        />
        <span className="text-muted-foreground text-xs flex-shrink-0">–</span>
        <input
          type="date" value={to} onChange={handleTo}
          className="h-7 px-2 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-[118px]"
        />
        <PeriodDropdown activePeriod={activePeriod} onSelect={handleSelectPeriod} />
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

        {/* ── Page title ── */}
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

        {/* ── Refresh Data ── */}
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
