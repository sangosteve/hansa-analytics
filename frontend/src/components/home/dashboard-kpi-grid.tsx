import {
  ChartUpIcon,
  Activity01Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";
import type { SalesSummaryMonthlyRow, PredictiveInsightsResponse } from "@/lib/api";
import type { ComparisonMode } from "@/lib/comparison-utils";

export const DEFAULT_TARGET_TONNES = 320;

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtT = (v: number) => `${nf.format(Math.abs(v))} t`;
const fmtTSigned = (v: number) => `${v >= 0 ? "+" : "-"}${fmtT(v)}`;

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function inferPeriodLabel(dateFrom: string, dateTo: string): string {
  const from = new Date(dateFrom + "T00:00:00");
  const to = new Date(dateTo + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  to.setHours(0,0,0,0);
  const isMTD =
    from.getFullYear() === today.getFullYear() &&
    from.getMonth() === today.getMonth() &&
    from.getDate() === 1 &&
    to.getTime() === today.getTime();
  const isYTD =
    from.getFullYear() === today.getFullYear() &&
    from.getMonth() === 0 &&
    from.getDate() === 1 &&
    to.getTime() === today.getTime();
  const isQTD = (() => {
    const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    return from.getTime() === qStart.getTime() && to.getTime() === today.getTime();
  })();
  if (isMTD) return "MTD";
  if (isYTD) return "YTD";
  if (isQTD) return "QTD";
  const isToday = from.getTime() === today.getTime() && to.getTime() === today.getTime();
  if (isToday) return "Today";
  return "Period";
}

function getKpiTitle(dateFrom: string, dateTo: string): string {
  const label = inferPeriodLabel(dateFrom, dateTo);
  const today = new Date();
  if (label === "MTD") return `MTD Tonnes (as of ${today.getDate()} ${MONTH_SHORT[today.getMonth()]})`;
  if (label === "YTD") return "YTD Tonnes";
  if (label === "QTD") return "QTD Tonnes";
  if (label === "Today") return "Today Tonnes";
  return "Period Tonnes";
}

function getCompShortLabel(mode: ComparisonMode, periodLabel: string): string {
  if (mode === "same_period_ly") {
    if (periodLabel === "MTD") return "LY MTD";
    if (periodLabel === "YTD") return "LY YTD";
    if (periodLabel === "QTD") return "LY QTD";
    return "LY Period";
  }
  return "Prior Period";
}

function ForecastChart({ daysElapsed, daysInMonth, actualTonnes, projectedTonnes }: {
  daysElapsed: number; daysInMonth: number; actualTonnes: number; projectedTonnes: number;
}) {
  const W = 110, H = 52;
  const pL = 4, pR = 6, pT = 12, pB = 4;
  const maxY = Math.max(projectedTonnes, actualTonnes, 0.01) * 1.2;
  const todayFrac = Math.min(daysElapsed / (daysInMonth || 1), 1);
  const xOf = (frac: number) => pL + frac * (W - pL - pR);
  const yOf = (v: number) => (H - pB) - (v / maxY) * (H - pT - pB);
  const tx = xOf(todayFrac);
  const ay = yOf(actualTonnes);
  const py = yOf(projectedTonnes);
  const by = H - pB;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <defs>
        <linearGradient id="fg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pL},${by} ${pL},${by} ${tx},${ay} ${tx},${by}`} fill="url(#fg2)" />
      <line x1={pL} y1={by} x2={tx} y2={ay} stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" />
      <line x1={tx} y1={ay} x2={W - pR} y2={py} stroke="#818cf8" strokeWidth="1.8" strokeDasharray="3 2.5" strokeLinecap="round" />
      <circle cx={W - pR} cy={py} r="2.5" fill="#818cf8" />
      <line x1={tx} y1={pT - 2} x2={tx} y2={H - pB} stroke="#fbbf24" strokeWidth="1" strokeDasharray="2 2" />
      <text x={tx + 2} y={pT + 1} fill="#fbbf24" fontSize="6.5" fontFamily="system-ui" fontWeight="600">Today</text>
    </svg>
  );
}

function TargetBar({ pct }: { pct: number }) {
  const fill = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${fill}%`, background: "linear-gradient(90deg, #34d39980, #34d399)" }} />
    </div>
  );
}

function DailyAvgSparkBar({ dailyAvg, targetDailyRate }: { dailyAvg: number; targetDailyRate: number | null }) {
  if (!targetDailyRate || targetDailyRate <= 0) return null;
  const pct = Math.min((dailyAvg / targetDailyRate) * 100, 130);
  const color = dailyAvg >= targetDailyRate ? "#34d399" : dailyAvg >= targetDailyRate * 0.8 ? "#f59e0b" : "#f87171";
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3">
      <div className="h-2.5 w-28 bg-muted/60 rounded" />
      <div className="h-8 w-36 bg-muted/60 rounded" />
      <div className="h-2 w-44 bg-muted/60 rounded" />
    </div>
  );
}

function KpiCard({ children, accentColor, bgTint, className = "" }: {
  children: React.ReactNode;
  accentColor: string;
  bgTint?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-xl bg-card p-4 overflow-hidden flex flex-col gap-2.5 ${bgTint ?? ""} ${className}`}
      style={{ border: `1px solid ${accentColor}66` }}
    >
      {children}
    </div>
  );
}

export interface DashboardKpiGridProps {
  totalTonnes: number;
  comparisonTonnes: number;
  comparisonLabel?: string;
  salesRows: SalesSummaryMonthlyRow[];
  mtd: PredictiveInsightsResponse["mtd_projection"] | null;
  targetTonnes?: number;
  loading: boolean;
  predictiveLoading: boolean;
  dateFrom: string;
  dateTo: string;
  comparisonMode: ComparisonMode;
}

export default function DashboardKpiGrid({
  totalTonnes,
  comparisonTonnes,
  comparisonLabel,
  mtd,
  targetTonnes = DEFAULT_TARGET_TONNES,
  loading,
  predictiveLoading,
  dateFrom,
  dateTo,
  comparisonMode,
}: DashboardKpiGridProps) {
  const periodLabel = inferPeriodLabel(dateFrom, dateTo);
  const kpiTitle = getKpiTitle(dateFrom, dateTo);
  const compShort = comparisonLabel ?? getCompShortLabel(comparisonMode, periodLabel);

  const yoyPct = comparisonTonnes > 0
    ? ((totalTonnes - comparisonTonnes) / comparisonTonnes) * 100
    : null;
  const tonneDiff = totalTonnes - comparisonTonnes;

  const progressPct = targetTonnes > 0 ? (totalTonnes / targetTonnes) * 100 : 0;
  const comparisonProgressPct = comparisonTonnes > 0 && targetTonnes > 0
    ? (comparisonTonnes / targetTonnes) * 100
    : null;
  const ppDiff = comparisonProgressPct !== null ? progressPct - comparisonProgressPct : null;

  const projectedEOM = mtd?.projected_eom_tonnes ?? null;
  const projVsTarget = projectedEOM != null ? projectedEOM - targetTonnes : null;
  const projVsTargetPct = projectedEOM != null && targetTonnes > 0
    ? ((projectedEOM - targetTonnes) / targetTonnes) * 100 : null;

  const daysInPeriod = (() => {
    if (!dateFrom || !dateTo) return 1;
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00");
    return Math.max(Math.round((to.getTime() - from.getTime()) / 86400000) + 1, 1);
  })();
  const dailyAvg = totalTonnes / daysInPeriod;
  const lyDailyAvg = comparisonTonnes > 0 ? comparisonTonnes / daysInPeriod : null;
  const dailyAvgDiff = lyDailyAvg !== null ? dailyAvg - lyDailyAvg : null;
  const dailyAvgPct = lyDailyAvg !== null && lyDailyAvg > 0 ? ((dailyAvg - lyDailyAvg) / lyDailyAvg) * 100 : null;

  const targetDailyRate = (() => {
    if (!targetTonnes || !dateFrom) return null;
    const d = new Date(dateFrom + "T00:00:00");
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return targetTonnes / daysInMonth;
  })();

  if (loading && totalTonnes === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* ── 1. Period Tonnes (green) ── */}
      <KpiCard accentColor="#10b981" bgTint="bg-emerald-950/10">
        <div className="flex items-center gap-2">
          <ChartUpIcon size={14} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[10.5px] font-semibold text-muted-foreground truncate">
            {kpiTitle}
          </span>
        </div>
        <div>
          <div className="text-[32px] font-extrabold text-foreground leading-none tracking-tight">
            {fmtT(totalTonnes)}
          </div>
          {comparisonTonnes > 0 && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              vs {fmtT(comparisonTonnes)} {compShort}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {yoyPct !== null ? (
              <>
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  yoyPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {yoyPct >= 0 ? "▲" : "▼"} {Math.abs(yoyPct).toFixed(1)}%
                </span>
                <span className={`text-[11px] font-semibold ${yoyPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtTSigned(tonneDiff)}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground/50 italic">No comparison data</span>
            )}
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground/55">
            {comparisonMode === "same_period_ly" ? "Same period last year" : "Previous period"}
          </div>
        </div>
      </KpiCard>

      {/* ── 2. Target Progress (amber) ── */}
      <KpiCard accentColor="#f59e0b" bgTint="bg-amber-950/10">
        <div className="flex items-center gap-2">
          <CheckmarkCircle01Icon size={14} className="text-amber-400 flex-shrink-0" />
          <span className="text-[10.5px] font-semibold text-muted-foreground whitespace-nowrap">
            Target Progress ({periodLabel})
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[32px] font-extrabold text-foreground leading-none tracking-tight">
              {progressPct.toFixed(1)}%
            </span>
            {comparisonProgressPct !== null && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                vs {comparisonProgressPct.toFixed(1)}% {compShort}
              </span>
            )}
          </div>
          {ppDiff !== null && (
            <div className={`text-[13px] font-bold leading-none ${ppDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {ppDiff >= 0 ? "▲" : "▼"} {Math.abs(ppDiff).toFixed(1)} pp
            </div>
          )}
          <div className="mt-0.5">
            <TargetBar pct={progressPct} />
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-muted-foreground mt-0.5">
            <span>Target: {fmtT(targetTonnes)}</span>
            <span>{fmtT(totalTonnes)} / {fmtT(targetTonnes)}</span>
          </div>
        </div>
      </KpiCard>

      {/* ── 3. Daily Average Tonnes (cyan) ── */}
      <KpiCard accentColor="#06b6d4" bgTint="bg-cyan-950/10">
        <div className="flex items-center gap-2">
          <Calendar03Icon size={14} className="text-cyan-400 flex-shrink-0" />
          <span className="text-[10.5px] font-semibold text-muted-foreground whitespace-nowrap">
            Daily Avg Tonnes ({periodLabel})
          </span>
        </div>
        <div>
          <div className="text-[32px] font-extrabold text-foreground leading-none tracking-tight">
            {nf.format(dailyAvg)} t
          </div>
          <div className="mt-1 text-[10.5px] text-muted-foreground">per day</div>
          {lyDailyAvg !== null && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              vs {nf.format(lyDailyAvg)} t/day {compShort}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {dailyAvgPct !== null ? (
              <>
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  dailyAvgPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {dailyAvgPct >= 0 ? "▲" : "▼"} {Math.abs(dailyAvgPct).toFixed(1)}%
                </span>
                {dailyAvgDiff !== null && (
                  <span className={`text-[11px] font-semibold ${dailyAvgDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtTSigned(dailyAvgDiff)}/day
                  </span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground/50 italic">No comparison data</span>
            )}
          </div>
          {targetDailyRate !== null && (
            <>
              <div className="mt-2">
                <DailyAvgSparkBar dailyAvg={dailyAvg} targetDailyRate={targetDailyRate} />
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground/55">
                Target rate: {nf.format(targetDailyRate)} t/day · {daysInPeriod}d period
              </div>
            </>
          )}
        </div>
      </KpiCard>

      {/* ── 4. Projected Month-End (violet) ── */}
      <KpiCard accentColor="#8b5cf6" bgTint="bg-violet-950/10">
        <div className="flex items-center gap-2">
          <Activity01Icon size={14} className="text-violet-400 flex-shrink-0" />
          <span className="text-[10.5px] font-semibold text-muted-foreground whitespace-nowrap">
            Projected Month-End
          </span>
        </div>
        {predictiveLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Computing…</div>
        ) : projectedEOM !== null ? (
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[32px] font-extrabold text-foreground leading-none tracking-tight">
                {fmtT(projectedEOM)}
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                vs Target: {fmtT(targetTonnes)}
              </div>
              {projVsTargetPct !== null && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    projVsTargetPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {projVsTargetPct >= 0 ? "▲" : "▼"} {Math.abs(projVsTargetPct).toFixed(1)}%
                  </span>
                  {projVsTarget !== null && (
                    <span className={`text-[11px] font-semibold ${projVsTarget >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtTSigned(projVsTarget)}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-1.5 text-[10px] text-muted-foreground/55 leading-tight">
                Based on run-rate, last 3 months<br />and same period last year
              </div>
            </div>
            {mtd && (
              <div className="flex-shrink-0 self-end pb-0.5 opacity-90">
                <ForecastChart
                  daysElapsed={mtd.days_elapsed}
                  daysInMonth={mtd.days_in_month}
                  actualTonnes={mtd.actual_tonnes}
                  projectedTonnes={mtd.projected_eom_tonnes}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-[28px] font-extrabold text-foreground">—</div>
        )}
      </KpiCard>

    </div>
  );
}
