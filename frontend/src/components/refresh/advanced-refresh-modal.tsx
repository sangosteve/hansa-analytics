import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { triggerCustomRefresh, type CustomRefreshPayload } from "@/lib/api";

const ALL_COMPANIES = [
  { value: "3", label: "Retail" },
  { value: "4", label: "Manufacturing" },
  { value: "5", label: "Engineering" },
  { value: "6", label: "Mining" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onClose: () => void;
  onJobStarted: (jobId: string) => void;
};

export function AdvancedRefreshModal({ open, onClose, onJobStarted }: Props) {
  const [companies, setCompanies] = useState<string[]>(["3", "4", "5", "6"]);
  const [dateFrom, setDateFrom] = useState(nDaysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [includeMaster, setIncludeMaster] = useState(false);
  const [includeInvoices, setIncludeInvoices] = useState(true);
  const [includeDeliveries, setIncludeDeliveries] = useState(true);
  const [includeOrders, setIncludeOrders] = useState(false);
  const [includeReceipts, setIncludeReceipts] = useState(false);
  const [includeGlAccounts, setIncludeGlAccounts] = useState(false);
  const [includeGlTransactions, setIncludeGlTransactions] = useState(false);
  const [rebuildFacts, setRebuildFacts] = useState(true);
  const [rebuildMovement, setRebuildMovement] = useState(true);
  const [rebuildStock, setRebuildStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  function toggleCompany(val: string) {
    setCompanies((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
  }

  async function handleRun() {
    if (companies.length === 0) { setError("Select at least one company."); return; }
    if (!dateFrom || !dateTo) { setError("Date range is required."); return; }
    if (dateFrom > dateTo) { setError("Start date must be before end date."); return; }

    setLoading(true);
    setError(null);
    try {
      const payload: CustomRefreshPayload = {
        company_nos: companies,
        date_from: dateFrom,
        date_to: dateTo,
        include_master: includeMaster,
        include_invoices: includeInvoices,
        include_deliveries: includeDeliveries,
        include_orders: includeOrders,
        include_receipts: includeReceipts,
        include_gl_accounts: includeGlAccounts,
        include_gl_transactions: includeGlTransactions,
        rebuild_facts: rebuildFacts,
        rebuild_movement: rebuildMovement,
        rebuild_stock: rebuildStock,
      };
      const job = await triggerCustomRefresh(payload);
      onJobStarted(job.job_id);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to start refresh");
    } finally {
      setLoading(false);
    }
  }

  const chk = (v: boolean, set: (b: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div
        onClick={() => set(!v)}
        className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
          v ? "bg-primary border-primary" : "border-border hover:border-primary/50"
        }`}
      >
        {v && (
          <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-xs text-foreground/80 group-hover:text-foreground transition-colors select-none">
        {label}
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Advanced Refresh</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Companies */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55 mb-2">
              Companies
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_COMPANIES.map((co) => (
                <label key={co.value} className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() => toggleCompany(co.value)}
                    className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      companies.includes(co.value) ? "bg-primary border-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    {companies.includes(co.value) && (
                      <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-foreground/80 group-hover:text-foreground transition-colors select-none">
                    {co.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Date range */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55 mb-2">
              Date Range
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-7 px-2 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 flex-1"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-7 px-2 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 flex-1"
              />
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {[
                { label: "7d", days: 7 },
                { label: "30d", days: 30 },
                { label: "90d", days: 90 },
                { label: "MTD", days: -1 },
                { label: "YTD", days: -2 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    const t = today();
                    if (p.days === -1) {
                      const d = new Date(); d.setDate(1);
                      setDateFrom(d.toISOString().slice(0, 10));
                    } else if (p.days === -2) {
                      const d = new Date(); d.setMonth(0); d.setDate(1);
                      setDateFrom(d.toISOString().slice(0, 10));
                    } else {
                      setDateFrom(nDaysAgo(p.days));
                    }
                    setDateTo(t);
                  }}
                  className="h-5 px-2 text-[10px] rounded border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Components */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55 mb-2">
              Components
            </p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {chk(includeMaster, setIncludeMaster, "Master Data")}
              {chk(includeInvoices, setIncludeInvoices, "Invoices")}
              {chk(includeDeliveries, setIncludeDeliveries, "Deliveries")}
              {chk(includeOrders, setIncludeOrders, "Sales Orders")}
              {chk(includeReceipts, setIncludeReceipts, "Receipts")}
              {chk(includeGlAccounts, setIncludeGlAccounts, "GL Accounts")}
              {chk(includeGlTransactions, setIncludeGlTransactions, "GL Transactions")}
              {chk(rebuildFacts, setRebuildFacts, "Sales Facts")}
              {chk(rebuildMovement, setRebuildMovement, "Customer Movement")}
              {chk(rebuildStock, setRebuildStock, "Stock Status")}
            </div>
          </div>

          {error && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-8 rounded-md border border-border bg-secondary text-xs font-medium text-foreground hover:bg-accent/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={loading || companies.length === 0}
              className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting...
                </>
              ) : (
                "Start Refresh"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
