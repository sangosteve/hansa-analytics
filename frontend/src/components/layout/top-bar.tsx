import { useState } from "react";
import { useLocation } from "wouter";
import {
  Building01Icon,
  ArrowReloadHorizontalIcon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
function DateRangePicker() {
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
    { label: "7d",  action: () => setDateRange(nDaysAgo(7),   today()) },
    { label: "30d", action: () => setDateRange(nDaysAgo(30),  today()) },
    { label: "90d", action: () => setDateRange(nDaysAgo(90),  today()) },
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
        <div className="flex items-center gap-1 ml-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={p.action}
              className="h-5 px-1.5 text-[10px] rounded border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={resetDateRange}
            className={`h-5 px-1.5 text-[10px] rounded border transition-colors ${
              isAllTime
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
        <h1 className="font-semibold text-sm text-foreground mr-auto truncate">{pageTitle}</h1>

        <DateRangePicker />

        <div className="h-6 w-px bg-border/60 flex-shrink-0" />

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

        <div className="h-6 w-px bg-border/60 flex-shrink-0" />

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

        {/* Refresh Data */}
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
