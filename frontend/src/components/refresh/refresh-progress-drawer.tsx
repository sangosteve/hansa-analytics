import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getRefreshJobStatus, type RefreshJob, type RefreshJobStep } from "@/lib/api";
import {
  CheckmarkCircle01Icon,
  CancelCircleIcon,
  Loading01Icon,
  Clock01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "hugeicons-react";

const COMPANY_LABELS: Record<string, string> = {
  "3": "Retail",
  "4": "Manufacturing",
  "5": "Engineering",
  "6": "Mining",
  all: "All Companies",
};

const STEP_LABELS: Record<string, string> = {
  master_data: "Master Data",
  invoices: "Invoices",
  deliveries: "Deliveries",
  fact_sales: "Sales Facts",
  customer_movement: "Customer Movement",
  stock: "Stock Status",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "done" || status === "success" || status === "ok")
    return <CheckmarkCircle01Icon size={14} className="text-emerald-400 flex-shrink-0" />;
  if (status === "error")
    return <CancelCircleIcon size={14} className="text-red-400 flex-shrink-0" />;
  if (status === "running")
    return <Loading01Icon size={14} className="text-primary animate-spin flex-shrink-0" />;
  return <Clock01Icon size={14} className="text-muted-foreground/40 flex-shrink-0" />;
}

function formatDuration(started: string, finished: string | null) {
  const start = new Date(started).getTime();
  const end = finished ? new Date(finished).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function CompanySection({
  company,
  steps,
  isRunning,
}: {
  company: string;
  steps: RefreshJobStep[];
  isRunning: boolean;
}) {
  const [open, setOpen] = useState(true);
  const hasError = steps.some((s) => s.status === "error");
  const allDone = steps.length > 0 && steps.every((s) => s.status === "done" || s.status === "success");

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-card/60 hover:bg-accent/20 transition-colors text-left"
      >
        {open ? (
          <ArrowDown01Icon size={12} className="text-muted-foreground flex-shrink-0" />
        ) : (
          <ArrowRight01Icon size={12} className="text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground flex-1">
          {COMPANY_LABELS[company] ?? `Company ${company}`}
        </span>
        {hasError && <span className="text-[10px] text-red-400 font-medium">Failed</span>}
        {!hasError && allDone && <span className="text-[10px] text-emerald-400 font-medium">Done</span>}
        {isRunning && !allDone && !hasError && (
          <Loading01Icon size={12} className="text-primary animate-spin" />
        )}
      </button>
      {open && steps.length > 0 && (
        <div className="divide-y divide-border/50">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5 px-3 py-2">
              <StatusIcon status={step.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-foreground">
                    {STEP_LABELS[step.step] ?? step.step}
                  </span>
                  {step.records > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {step.records.toLocaleString()} records
                    </span>
                  )}
                </div>
                {step.message && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-relaxed truncate" title={step.message}>
                    {step.message.length > 100 ? step.message.slice(0, 100) + "…" : step.message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && steps.length === 0 && isRunning && (
        <div className="px-3 py-2 flex items-center gap-2">
          <Loading01Icon size={12} className="text-primary animate-spin" />
          <span className="text-[11px] text-muted-foreground">Waiting...</span>
        </div>
      )}
    </div>
  );
}

type Props = {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
};

export function RefreshProgressDrawer({ jobId, open, onClose, onDone }: Props) {
  const [job, setJob] = useState<RefreshJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneCalledRef = useRef(false);

  useEffect(() => {
    if (!jobId || !open) return;
    doneCalledRef.current = false;
    setJob(null);

    const poll = async () => {
      try {
        const j = await getRefreshJobStatus(jobId);
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (!doneCalledRef.current && j.status === "done") {
            doneCalledRef.current = true;
            onDone?.();
          }
        }
      } catch {
        // keep polling
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [jobId, open]);

  const isRunning = !job || job.status === "queued" || job.status === "running";

  const companiesWithSteps = job
    ? Array.from(
        new Map(
          job.steps
            .filter((s) => s.company !== "all")
            .map((s) => [s.company, s.company])
        ).values()
      )
    : [];

  const allSteps = job?.steps ?? [];
  const globalSteps = allSteps.filter((s) => s.company === "all");
  const perCompanySteps = (co: string) => allSteps.filter((s) => s.company === co);

  const totalRecords = allSteps.reduce((acc, s) => acc + (s.records || 0), 0);
  const errorCount = allSteps.filter((s) => s.status === "error").length;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            {isRunning && <Loading01Icon size={16} className="text-primary animate-spin" />}
            {!isRunning && job?.status === "done" && !errorCount && (
              <CheckmarkCircle01Icon size={16} className="text-emerald-400" />
            )}
            {!isRunning && (job?.status === "error" || !!errorCount) && (
              <CancelCircleIcon size={16} className="text-red-400" />
            )}
            <SheetTitle className="text-sm font-semibold">
              {isRunning ? "Refreshing Data..." : errorCount ? "Refresh Completed with Errors" : "Refresh Complete"}
            </SheetTitle>
          </div>

          {job && (
            <div className="flex flex-wrap gap-3 mt-2">
              <span className="text-[10px] text-muted-foreground">
                {job.date_from} → {job.date_to}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {job.companies.map((c) => COMPANY_LABELS[c] ?? c).join(", ")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatDuration(job.started_at, job.finished_at)}
              </span>
              {totalRecords > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {totalRecords.toLocaleString()} records
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Current step indicator while running */}
          {isRunning && job?.current_step && (
            <div className="flex items-center gap-2 text-[11px] text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
              <Loading01Icon size={12} className="animate-spin flex-shrink-0" />
              {job.current_step}
            </div>
          )}

          {/* Global steps (master data, customer movement) */}
          {globalSteps.length > 0 && (
            <div className="space-y-1.5">
              {globalSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2 border border-border rounded-md">
                  <StatusIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-foreground">
                        {STEP_LABELS[step.step] ?? step.step}
                      </span>
                      {step.records > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {step.records.toLocaleString()} records
                        </span>
                      )}
                    </div>
                    {step.message && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate" title={step.message}>
                        {step.message.length > 100 ? step.message.slice(0, 100) + "…" : step.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Per-company sections */}
          {job?.companies
            .filter((c) => c !== "all")
            .map((co) => (
              <CompanySection
                key={co}
                company={co}
                steps={perCompanySteps(co)}
                isRunning={isRunning}
              />
            ))}

          {/* Placeholder when no steps yet */}
          {!job && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Loading01Icon size={24} className="text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Starting refresh...</p>
            </div>
          )}

          {/* Final status */}
          {!isRunning && job && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-medium ${
                errorCount
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              }`}
            >
              {errorCount ? (
                <>
                  <CancelCircleIcon size={14} className="flex-shrink-0" />
                  {errorCount} step{errorCount > 1 ? "s" : ""} failed. Dashboard data may be partial.
                </>
              ) : (
                <>
                  <CheckmarkCircle01Icon size={14} className="flex-shrink-0" />
                  All steps completed. Dashboard data updated.
                </>
              )}
            </div>
          )}
        </div>

        {!isRunning && (
          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="w-full h-8 rounded-md bg-secondary border border-border text-xs font-medium text-foreground hover:bg-accent/30 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
