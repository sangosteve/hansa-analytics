import { createContext, useContext, useState, type ReactNode } from "react";

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

type CompanyContextType = {
  companyNos: string[];
  setCompanyNos: (v: string[]) => void;
  saleScope: SaleScope;
  setSaleScope: (v: SaleScope) => void;
  companyLabel: string;
};

const CompanyContext = createContext<CompanyContextType | null>(null);

const ALL_VALUES = COMPANY_OPTIONS.map((c) => c.value);

function buildLabel(companyNos: string[]): string {
  if (!companyNos.length || companyNos.includes("all") || companyNos.length === ALL_VALUES.length) {
    return "All Companies";
  }
  if (companyNos.length === 1) {
    return `Co. ${companyNos[0]} — ${COMPANY_OPTIONS.find((c) => c.value === companyNos[0])?.label ?? companyNos[0]}`;
  }
  return companyNos
    .map((no) => COMPANY_OPTIONS.find((c) => c.value === no)?.label ?? no)
    .join(", ");
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyNos, setCompanyNos] = useState<string[]>(["all"]);
  const [saleScope, setSaleScope] = useState<SaleScope>("all");
  const companyLabel = buildLabel(companyNos);

  return (
    <CompanyContext.Provider value={{ companyNos, setCompanyNos, saleScope, setSaleScope, companyLabel }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
