import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BarChart2, TrendingDown, Check, ChevronsUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCompany, COMPANY_OPTIONS, SCOPE_OPTIONS, type SaleScope } from "@/lib/company-context";

const tabs = [
  { path: "/", label: "Sales Dashboard", icon: BarChart2 },
  { path: "/movement", label: "Movement Analytics", icon: TrendingDown },
];

const ALL_VALUES = COMPANY_OPTIONS.map((c) => c.value);

export default function NavBar() {
  const [location] = useLocation();
  const { companyNos, setCompanyNos, saleScope, setSaleScope, companyLabel } = useCompany();
  const [open, setOpen] = useState(false);

  const isAll = companyNos.includes("all") || companyNos.length === ALL_VALUES.length || companyNos.length === 0;

  function toggleCompany(value: string) {
    if (value === "all") {
      setCompanyNos(["all"]);
      return;
    }
    const current = isAll ? [] : [...companyNos];
    const next = current.includes(value)
      ? current.filter((c) => c !== value)
      : [...current, value];
    setCompanyNos(next.length === 0 || next.length === ALL_VALUES.length ? ["all"] : next);
  }

  return (
    <nav className="flex-shrink-0 h-10 border-b border-border bg-card flex items-stretch px-2 gap-0.5">
      <div className="flex items-center pr-4 pl-2 mr-2 border-r border-border">
        <span className="text-xs font-bold tracking-tight text-foreground">Hansa</span>
      </div>

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

      <div className="ml-auto flex items-center gap-2 pr-1">
        {/* Sale scope segmented control */}
        <div className="flex items-center rounded-md border border-border bg-secondary overflow-hidden h-7">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSaleScope(opt.value as SaleScope)}
              className={`px-2.5 h-full text-xs font-medium transition-colors border-r border-border last:border-r-0 ${
                saleScope === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Multi-select company filter */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="h-7 px-2.5 text-xs font-medium rounded-md border border-border bg-secondary text-foreground flex items-center gap-1.5 hover:bg-accent/30 transition-colors min-w-[132px] max-w-[180px] justify-between">
              <span className="truncate">{companyLabel}</span>
              <ChevronsUpDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-1 bg-card border-border" align="end">
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
                  Co. {co.value} — {co.label}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}
