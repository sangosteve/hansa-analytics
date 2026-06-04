import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export const COMPANY_OPTIONS = [
  { value: "3", label: "Retail" },
  { value: "4", label: "Manufacturing" },
  { value: "5", label: "Engineering" },
  { value: "6", label: "Mining" },
];

export type SaleScope = "all" | "external" | "internal";

export const SCOPE_OPTIONS: { value: SaleScope; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "external", label: "External" },
  { value: "internal", label: "Internal" },
];

const ALL_TIME_FROM = "2020-01-01";
const ALL_TIME_TO   = "2030-12-31";

const STORAGE_KEY_FROM = "hansa-date-from";
const STORAGE_KEY_TO   = "hansa-date-to";

function currentYearFrom() {
  return `${new Date().getFullYear()}-01-01`;
}
function currentYearTo() {
  return `${new Date().getFullYear()}-12-31`;
}

function getInitialDateFrom(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_FROM) ?? currentYearFrom();
  } catch {
    return currentYearFrom();
  }
}

function getInitialDateTo(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_TO) ?? currentYearTo();
  } catch {
    return currentYearTo();
  }
}

type CompanyContextType = {
  companyNos: string[];
  setCompanyNos: (v: string[]) => void;
  saleScope: SaleScope;
  setSaleScope: (v: SaleScope) => void;
  companyLabel: string;
  dateFrom: string;
  dateTo: string;
  setDateRange: (from: string, to: string) => void;
  resetDateRange: () => void;
  isAllTime: boolean;
};

const CompanyContext = createContext<CompanyContextType | null>(null);

const ALL_VALUES = COMPANY_OPTIONS.map((c) => c.value);

function buildLabel(companyNos: string[]): string {
  if (!companyNos.length || companyNos.includes("all") || companyNos.length === ALL_VALUES.length) {
    return "All Companies";
  }
  if (companyNos.length === 1) {
    return COMPANY_OPTIONS.find((c) => c.value === companyNos[0])?.label ?? companyNos[0];
  }
  return companyNos
    .map((no) => COMPANY_OPTIONS.find((c) => c.value === no)?.label ?? no)
    .join(", ");
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyNos, setCompanyNos] = useState<string[]>(["all"]);
  const [saleScope, setSaleScope]   = useState<SaleScope>("all");
  const [dateFrom, setDateFrom]     = useState<string>(getInitialDateFrom);
  const [dateTo, setDateTo]         = useState<string>(getInitialDateTo);

  const companyLabel = buildLabel(companyNos);

  const isAllTime = dateFrom === ALL_TIME_FROM && dateTo === ALL_TIME_TO;

  const setDateRange = useCallback((from: string, to: string) => {
    const f = from || ALL_TIME_FROM;
    const t = to || ALL_TIME_TO;
    setDateFrom(f);
    setDateTo(t);
    try {
      localStorage.setItem(STORAGE_KEY_FROM, f);
      localStorage.setItem(STORAGE_KEY_TO, t);
    } catch {}
  }, []);

  const resetDateRange = useCallback(() => {
    setDateFrom(ALL_TIME_FROM);
    setDateTo(ALL_TIME_TO);
    try {
      localStorage.setItem(STORAGE_KEY_FROM, ALL_TIME_FROM);
      localStorage.setItem(STORAGE_KEY_TO, ALL_TIME_TO);
    } catch {}
  }, []);

  return (
    <CompanyContext.Provider value={{
      companyNos, setCompanyNos,
      saleScope, setSaleScope,
      companyLabel,
      dateFrom, dateTo,
      setDateRange, resetDateRange,
      isAllTime,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
