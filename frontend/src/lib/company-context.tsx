import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";

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

export type DatePreset = "1m" | "3m" | "6m" | "ytd" | "1y" | "2y" | "all";

export interface DatePresetOption {
  value: DatePreset;
  label: string;
}

export const DATE_PRESET_OPTIONS: DatePresetOption[] = [
  { value: "1m",  label: "1M" },
  { value: "3m",  label: "3M" },
  { value: "6m",  label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y",  label: "1Y" },
  { value: "2y",  label: "2Y" },
  { value: "all", label: "All" },
];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computePresetDates(preset: DatePreset): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const dateTo = toIso(today);
  switch (preset) {
    case "1m": {
      const d = new Date(today); d.setMonth(d.getMonth() - 1);
      return { dateFrom: toIso(d), dateTo };
    }
    case "3m": {
      const d = new Date(today); d.setMonth(d.getMonth() - 3);
      return { dateFrom: toIso(d), dateTo };
    }
    case "6m": {
      const d = new Date(today); d.setMonth(d.getMonth() - 6);
      return { dateFrom: toIso(d), dateTo };
    }
    case "ytd":
      return { dateFrom: `${today.getFullYear()}-01-01`, dateTo };
    case "1y": {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1);
      return { dateFrom: toIso(d), dateTo };
    }
    case "2y": {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 2);
      return { dateFrom: toIso(d), dateTo };
    }
    case "all":
    default:
      return { dateFrom: "2020-01-01", dateTo: "2030-12-31" };
  }
}

type CompanyContextType = {
  companyNos: string[];
  setCompanyNos: (v: string[]) => void;
  saleScope: SaleScope;
  setSaleScope: (v: SaleScope) => void;
  companyLabel: string;
  datePreset: DatePreset;
  setDatePreset: (v: DatePreset) => void;
  dateFrom: string;
  dateTo: string;
  customFrom: string;
  customTo: string;
  isCustom: boolean;
  setCustomDates: (from: string, to: string) => void;
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
  const [saleScope, setSaleScope] = useState<SaleScope>("all");
  const [datePreset, setDatePresetRaw] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const isCustom = !!(customFrom && customTo);

  const companyLabel = buildLabel(companyNos);
  const { dateFrom: presetFrom, dateTo: presetTo } = useMemo(
    () => computePresetDates(datePreset),
    [datePreset],
  );

  const dateFrom = isCustom ? customFrom : presetFrom;
  const dateTo   = isCustom ? customTo   : presetTo;

  const setDatePreset = useCallback((v: DatePreset) => {
    setCustomFrom("");
    setCustomTo("");
    setDatePresetRaw(v);
  }, []);

  const setCustomDates = useCallback((from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
  }, []);

  return (
    <CompanyContext.Provider value={{
      companyNos, setCompanyNos,
      saleScope, setSaleScope,
      companyLabel,
      datePreset, setDatePreset,
      dateFrom, dateTo,
      customFrom, customTo, isCustom,
      setCustomDates,
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
