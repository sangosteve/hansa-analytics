import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BarChart2, TrendingDown, Check, ChevronsUpDown } from "lucide-react";
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

  const isAll = companyNos.includes("all") || companyNos.length === ALL_VALUES.length || companyNos.length === 0;

  function toggleCompany(value: string) {
    if (value === "all") { setCompanyNos(["all"]); return; }
    const current = isAll ? [] : [...companyNos];
    const next = current.includes(value)
      ? current.filter((c) => c !== value)
      : [...current, value];
    setCompanyNos(next.length === 0 || next.length === ALL_VALUES.length ? ["all"] : next);
  }

  const inputCls = (active: boolean) =>
    `h-[26px] px-2 text-[11px] rounded border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors w-[108px] ${
      active ? "border-primary/60" : "border-border text-muted-foreground"
    }`;

  return (
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

      </div>
    </nav>
  );
}
