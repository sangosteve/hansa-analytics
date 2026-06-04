import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Building01Icon,
  ArrowReloadHorizontalIcon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  Calendar01Icon,
} from "hugeicons-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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

// ── Date Range Picker ─────────────────────────────────────────────────────────
function DateRangePicker() {
  const { dateFrom, dateTo, setDateRange, resetDateRange, isAllTime } = useCompany();
  const [open, setOpen] = useState(false);

  // Local range tracks in-progress selection — only committed once both ends are picked
  const contextRange: DateRange = {
    from: dateFrom ? new Date(dateFrom + "T00:00:00") : undefined,
    to:   dateTo   ? new Date(dateTo   + "T00:00:00") : undefined,
  };
  const [localRange, setLocalRange] = useState<DateRange>(contextRange);

  // Sync local range from context whenever the popover opens
  useEffect(() => {
    if (open) setLocalRange(contextRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelect = useCallback((range: DateRange | undefined) => {
    if (!range) return;
    setLocalRange(range);
    // Only commit + close when the user has picked BOTH ends of the range
    if (range.from && range.to) {
      setDateRange(
        format(range.from, "yyyy-MM-dd"),
        format(range.to,   "yyyy-MM-dd"),
      );
      setOpen(false);
    }
  }, [setDateRange]);

  const label = isAllTime
    ? "All Time"
    : `${contextRange.from ? format(contextRange.from, "dd MMM yyyy") : "—"}  –  ${contextRange.to ? format(contextRange.to, "dd MMM yyyy") : "—"}`;

  // Calendar opens on the month that contains the current `from` date
  const defaultMonth = localRange.from ?? new Date();

  return (
    <div className="flex items-center gap-1.5">
      <Calendar01Icon size={14} className="text-muted-foreground flex-shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-normal min-w-[210px] justify-start gap-2"
          >
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={localRange}
            onSelect={handleSelect}
            defaultMonth={defaultMonth}
            numberOfMonths={2}
            captionLayout="dropdown"
            fromYear={2020}
            toYear={new Date().getFullYear() + 1}
          />
          <div className="border-t border-border px-3 py-2 flex justify-between items-center gap-3">
            <span className="text-[10px] text-muted-foreground flex-1">
              {localRange.from && localRange.to
                ? `${format(localRange.from, "dd MMM yyyy")} – ${format(localRange.to, "dd MMM yyyy")}`
                : localRange.from
                  ? `From ${format(localRange.from, "dd MMM yyyy")} — pick an end date`
                  : "Pick a start date"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] flex-shrink-0"
              onClick={() => { resetDateRange(); setOpen(false); }}
            >
              All Time
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
export default function TopBar() {
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
      <header className="flex-shrink-0 h-[60px] border-b border-border bg-card flex items-center px-5 gap-4">
        {/* Page title */}
        <h1 className="font-semibold text-sm text-foreground mr-auto truncate">{pageTitle}</h1>

        {/* ── Date Range Picker ── */}
        <DateRangePicker />

        <div className="h-6 w-px bg-border/60 flex-shrink-0" />

        {/* ── Sale Type ── */}
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

        <div className="h-6 w-px bg-border/60 flex-shrink-0" />

        {/* ── Company ── */}
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
            <button
              onClick={() => toggleCompany("all")}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isAll ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
              }`}
            >
              <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isAll ? "bg-primary border-primary" : "border-border"}`}>
                {isAll && <CheckmarkCircle01Icon size={10} className="text-primary-foreground" />}
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
          </PopoverContent>
        </Popover>

        <div className="h-6 w-px bg-border/60 flex-shrink-0" />

        {/* ── Refresh Data ── */}
        <div className="flex items-stretch rounded-lg overflow-hidden border border-primary/60 h-8">
          <button
            onClick={handleDefaultRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowReloadHorizontalIcon size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Starting…" : "Refresh Data"}
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

      <RefreshProgressDrawer jobId={jobId} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <AdvancedRefreshModal open={advancedOpen} onClose={() => setAdvancedOpen(false)} onJobStarted={handleJobStarted} />
    </>
  );
}
