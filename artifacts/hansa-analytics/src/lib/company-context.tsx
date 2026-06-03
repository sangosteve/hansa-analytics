import { createContext, useContext, useState, type ReactNode } from "react";

export const COMPANIES = [
  { value: "all", label: "All Companies" },
  { value: "3",   label: "Co. 3 — Retail" },
  { value: "4",   label: "Co. 4 — Manufacturing" },
  { value: "5",   label: "Co. 5 — Engineering" },
  { value: "6",   label: "Co. 6 — Mining" },
];

type CompanyContextType = {
  companyNo: string;
  setCompanyNo: (v: string) => void;
  companyLabel: string;
};

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyNo, setCompanyNo] = useState("all");
  const companyLabel = COMPANIES.find((c) => c.value === companyNo)?.label ?? companyNo;
  return (
    <CompanyContext.Provider value={{ companyNo, setCompanyNo, companyLabel }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
