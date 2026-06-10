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

function DonutProgress({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size / 2) - 10;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct / 100, 0), 1) * circ;
  const offset = circ / 4;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(0deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={9} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
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
  todayTonnes: number;
  mtdTonnes: number;
  lyMtdTonnes: number;
  lyTodayTonnes: number;
  daysInMtd: number;
  daysInMonth: number;
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
  todayTonnes,
  mtdTonnes,
  lyMtdTonnes,
  lyTodayTonnes,
  daysInMtd,
  daysInMonth,
}: DashboardKpiGridProps) {
  const periodLabel = inferPeriodLabel(dateFrom, dateTo);
  const compShort = comparisonLabel ?? getCompShortLabel(comparisonMode, periodLabel);

  // MTD-specific computed values (prorated target, daily avg, etc.)
  const proratedTarget = daysInMonth > 0 ? targetTonnes * (daysInMtd / daysInMonth) : targetTonnes;
  const mtdProgressPct = proratedTarget > 0 ? (mtdTonnes / proratedTarget) * 100 : 0;
  const lyMtdProgressPct = proratedTarget > 0 ? (lyMtdTonnes / proratedTarget) * 100 : 0;
  const mtdTargetGap = mtdTonnes - proratedTarget;
  const ppVsLyMtd = mtdProgressPct - lyMtdProgressPct;
  const mtdDailyAvg = daysInMtd > 0 ? mtdTonnes / daysInMtd : 0;
  const lyMtdDailyAvgVal = daysInMtd > 0 ? lyMtdTonnes / daysInMtd : 0;
  const requiredPace = daysInMonth > 0 ? targetTonnes / daysInMonth : 0;

  if (loading && totalTonnes === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
      </div>
    );
  }

  const mtdPct = lyMtdTonnes > 0 ? ((mtdTonnes - lyMtdTonnes) / lyMtdTonnes) * 100 : null;
  const mtdDiff = mtdTonnes - lyMtdTonnes;
  const today = new Date();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* ── 1. Today's Tonnage (green) ── */}
      <KpiCard accentColor="#10b981" bgTint="bg-emerald-950/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Today's Tonnage</span>
          <ChartUpIcon size={13} className="text-emerald-400/60 flex-shrink-0" />
        </div>
        <div>
          <div className="text-[30px] font-extrabold text-foreground leading-none tracking-tight">
            {fmtT(todayTonnes)}
          </div>
          {lyTodayTonnes > 0 && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              vs same day last year: {fmtT(lyTodayTonnes)}
            </div>
          )}
          {lyTodayTonnes > 0 && (() => {
            const pct = ((todayTonnes - lyTodayTonnes) / lyTodayTonnes) * 100;
            const diff = todayTonnes - lyTodayTonnes;
            return (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  pct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                </span>
                <span className={`text-[11px] font-semibold ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtTSigned(diff)}
                </span>
              </div>
            );
          })()}
          <div className="mt-1.5 text-[10px] text-muted-foreground/55">
            {String(today.getDate()).padStart(2, "0")} {MONTH_SHORT[today.getMonth()]} {today.getFullYear()} only
          </div>
          {todayTonnes === 0 && lyTodayTonnes === 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground/40 italic">No data yet today</div>
          )}
        </div>
      </KpiCard>

      {/* ── 2. MTD Tonnage (teal) ── */}
      <KpiCard accentColor="#06b6d4" bgTint="bg-cyan-950/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">MTD Tonnage</span>
          <Calendar03Icon size={13} className="text-cyan-400/60 flex-shrink-0" />
        </div>
        <div>
          <div className="text-[30px] font-extrabold text-foreground leading-none tracking-tight">
            {fmtT(mtdTonnes)}
          </div>
          {lyMtdTonnes > 0 && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              vs LY MTD: {fmtT(lyMtdTonnes)}
            </div>
          )}
          {mtdPct !== null && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                mtdPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              }`}>
                {mtdPct >= 0 ? "▲" : "▼"} {Math.abs(mtdPct).toFixed(1)}%
              </span>
              <span className={`text-[11px] font-semibold ${mtdDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtTSigned(mtdDiff)}
              </span>
            </div>
          )}
          <div className="mt-1.5 text-[10px] text-muted-foreground/55">
            01 {MONTH_SHORT[today.getMonth()]} – {String(today.getDate()).padStart(2, "0")} {MONTH_SHORT[today.getMonth()]} {today.getFullYear()} ({daysInMtd} days)
          </div>
        </div>
      </KpiCard>

      {/* ── 3. Target Progress (MTD) — prorated donut (amber/green) ── */}
      {(() => {
        const donutColor = mtdProgressPct >= 100 ? "#10b981" : mtdProgressPct >= 80 ? "#f59e0b" : "#f87171";
        const monthName = ["January","February","March","April","May","June","July","August","September","October","November","December"][today.getMonth()];
        return (
          <KpiCard accentColor={mtdProgressPct >= 100 ? "#10b981" : "#f59e0b"} bgTint={mtdProgressPct >= 100 ? "bg-emerald-950/10" : "bg-amber-950/10"}>
            <div className="flex items-center gap-2">
              <CheckmarkCircle01Icon size={14} className={`flex-shrink-0 ${mtdProgressPct >= 100 ? "text-emerald-400" : "text-amber-400"}`} />
              <span className="text-[10px] font-bold tracking-widest whitespace-nowrap flex-1 uppercase" style={{ color: mtdProgressPct >= 100 ? "#34d399" : "#f59e0b" }}>
                Target Progress (MTD)
              </span>
              {mtdProgressPct >= 100 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 whitespace-nowrap">✓ Achieved</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
                <DonutProgress pct={mtdProgressPct} color={donutColor} size={80} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`text-[13px] font-extrabold leading-none ${mtdProgressPct >= 100 ? "text-emerald-400" : "text-foreground"}`}>
                    {mtdProgressPct.toFixed(1)}%
                  </span>
                  <span className="text-[7.5px] text-muted-foreground/60 mt-0.5">of target</span>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div>
                  <div className="text-[9px] text-muted-foreground/55">Actual</div>
                  <div className="text-[12.5px] font-bold text-foreground leading-tight">{fmtT(mtdTonnes)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground/55">Target (prorated)</div>
                  <div className="text-[11.5px] font-semibold text-muted-foreground leading-tight">{fmtT(proratedTarget)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground/55">Gap</div>
                  <div className={`text-[11.5px] font-bold leading-tight ${mtdTargetGap >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {mtdTargetGap >= 0 ? "+" : ""}{fmtT(mtdTargetGap)}
                  </div>
                </div>
                {lyMtdTonnes > 0 && (
                  <div>
                    <div className="text-[9px] text-muted-foreground/55">vs LY MTD</div>
                    <div className={`text-[10.5px] font-bold leading-tight ${ppVsLyMtd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {ppVsLyMtd >= 0 ? "▲" : "▼"} {Math.abs(ppVsLyMtd).toFixed(1)} pp ({lyMtdProgressPct.toFixed(1)}%)
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[9.5px] text-muted-foreground/55">
              <span>Target source: Manufacturing</span>
              <span className="text-muted-foreground/30">|</span>
              <span>{monthName} {today.getFullYear()}</span>
            </div>
          </KpiCard>
        );
      })()}

      {/* ── 4. Daily Avg Tonnes (MTD) ── */}
      <KpiCard accentColor="#06b6d4" bgTint="bg-cyan-950/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">Daily Avg Tonnes (MTD)</span>
          <Activity01Icon size={13} className="text-cyan-400/60 flex-shrink-0" />
        </div>
        <div>
          <div className="text-[27px] font-extrabold text-foreground leading-none tracking-tight">
            {nf.format(Math.round(mtdDailyAvg * 100) / 100)} t/day
          </div>
          {lyMtdDailyAvgVal > 0 && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              vs LY MTD: {nf.format(Math.round(lyMtdDailyAvgVal * 100) / 100)} t/day
            </div>
          )}
          {lyMtdDailyAvgVal > 0 && (() => {
            const pct = ((mtdDailyAvg - lyMtdDailyAvgVal) / lyMtdDailyAvgVal) * 100;
            const diff = mtdDailyAvg - lyMtdDailyAvgVal;
            return (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  pct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                </span>
                <span className={`text-[11px] font-semibold ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {diff >= 0 ? "+" : ""}{nf.format(Math.round(Math.abs(diff) * 100) / 100)} t/day
                </span>
              </div>
            );
          })()}
          {requiredPace > 0 && (
            <>
              <div className="mt-2">
                <DailyAvgSparkBar dailyAvg={mtdDailyAvg} targetDailyRate={requiredPace} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="text-[10.5px] text-muted-foreground/55">
                  Required target pace: {nf.format(Math.round(requiredPace * 100) / 100)} t/day
                </span>
                <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                  mtdDailyAvg >= requiredPace
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}>
                  {mtdDailyAvg >= requiredPace ? "Ahead of pace" : "Behind pace"}
                </span>
              </div>
            </>
          )}
        </div>
      </KpiCard>

    </div>
  );
}
