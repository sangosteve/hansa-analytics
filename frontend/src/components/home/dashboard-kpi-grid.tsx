import {
  ChartUpIcon,
  Activity01Icon,
  UserGroupIcon,
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
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
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

function Sparkline({ data, color = "#34d399", w = 104, h = 54 }: {
  data: number[]; color?: string; w?: number; h?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 3;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: (h - pad) - ((v - min) / range) * (h - pad * 2),
  }));
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M ${pts[0].x},${h - pad} ` +
    pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L ${pts[pts.length - 1].x},${h - pad} Z`;
  const gradId = `sg-${color.slice(1)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline points={line} stroke={color} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
}

function ForecastChart({ daysElapsed, daysInMonth, actualTonnes, projectedTonnes }: {
  daysElapsed: number; daysInMonth: number; actualTonnes: number; projectedTonnes: number;
}) {
  const W = 120, H = 56;
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

function HealthDonut({ healthy, atRisk, critical, score }: {
  healthy: number; atRisk: number; critical: number; score: number;
}) {
  const size = 92;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const total = Math.max(healthy + atRisk + critical, 1);
  const gap = 2;

  const healthyFrac = healthy / total;
  const atRiskFrac = atRisk / total;
  const criticalFrac = critical / total;

  const healthyDash = Math.max(healthyFrac * circ - gap, 0);
  const atRiskDash = Math.max(atRiskFrac * circ - gap, 0);
  const criticalDash = Math.max(criticalFrac * circ - gap, 0);

  const healthyOffset = gap / 2;
  const atRiskOffset = -(healthyDash + gap * 1.5);
  const criticalOffset = -(healthyDash + atRiskDash + gap * 2.5);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#21262d" strokeWidth="9" />
      {healthyDash > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#34d399" strokeWidth="9"
          strokeDasharray={`${healthyDash} ${circ - healthyDash}`}
          strokeDashoffset={healthyOffset}
          transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
      )}
      {atRiskDash > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth="9"
          strokeDasharray={`${atRiskDash} ${circ - atRiskDash}`}
          strokeDashoffset={atRiskOffset}
          transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
      )}
      {criticalDash > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f87171" strokeWidth="9"
          strokeDasharray={`${criticalDash} ${circ - criticalDash}`}
          strokeDashoffset={criticalOffset}
          transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle"
        fill="#e6edf3" fontSize="20" fontWeight="700" fontFamily="system-ui">{score}</text>
      <text x={cx} y={cy + 13} textAnchor="middle"
        fill="#8b949e" fontSize="8" fontFamily="system-ui">Score</text>
    </svg>
  );
}

function TargetBar({ pct }: { pct: number }) {
  const fill = Math.min(Math.max(pct, 0), 100);
  const color =
    fill >= 80 ? "#34d399" :
    fill >= 50 ? "#818cf8" :
    fill >= 20 ? "#60a5fa" :
    "#f59e0b";
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${fill}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
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

function KpiCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-xl border border-border bg-card p-4 overflow-hidden flex flex-col gap-2.5 ${className}`}>
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
  atRiskCustomers: number;
  activeCustomers: number;
  criticalCustomers?: number;
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
  salesRows,
  mtd,
  atRiskCustomers,
  activeCustomers,
  criticalCustomers = 0,
  targetTonnes = DEFAULT_TARGET_TONNES,
  loading,
  predictiveLoading,
  dateFrom,
  dateTo,
  comparisonMode,
}: DashboardKpiGridProps) {
  const periodLabel = inferPeriodLabel(dateFrom, dateTo);
  const kpiTitle = getKpiTitle(dateFrom, dateTo);
  const compShort = getCompShortLabel(comparisonMode, periodLabel);

  const yoyPct = comparisonTonnes > 0
    ? ((totalTonnes - comparisonTonnes) / comparisonTonnes) * 100
    : null;
  const tonneDiff = totalTonnes - comparisonTonnes;

  const progressPct = targetTonnes > 0 ? (totalTonnes / targetTonnes) * 100 : 0;
  const remaining = targetTonnes - totalTonnes;

  const projectedEOM = mtd?.projected_eom_tonnes ?? null;
  const projVsTarget = projectedEOM != null ? projectedEOM - targetTonnes : null;
  const projVsTargetPct = projectedEOM != null && targetTonnes > 0
    ? ((projectedEOM - targetTonnes) / targetTonnes) * 100 : null;

  const sparkData = salesRows.map(r => r.total_tonnes);

  const healthyCount = Math.max(activeCustomers - atRiskCustomers, 0);
  const critCount = Math.min(criticalCustomers, atRiskCustomers);
  const atRiskOnlyCount = Math.max(atRiskCustomers - critCount, 0);
  const totalForHealth = Math.max(healthyCount + atRiskOnlyCount + critCount, 1);
  const healthScore = Math.round((healthyCount / totalForHealth) * 100);
  const healthyPct = Math.round((healthyCount / totalForHealth) * 100);
  const atRiskPct = Math.round((atRiskOnlyCount / totalForHealth) * 100);
  const critPct = 100 - healthyPct - atRiskPct;

  if (loading && totalTonnes === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* ── 1. Period Tonnes ── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <ChartUpIcon size={13} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground truncate">
            {kpiTitle}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[30px] font-extrabold text-foreground leading-none tracking-tight whitespace-nowrap">
              {fmtT(totalTonnes)}
            </div>
            {comparisonTonnes > 0 && (
              <div className="mt-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                vs {fmtT(comparisonTonnes)} {compShort}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {yoyPct !== null ? (
                <>
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    yoyPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {yoyPct >= 0 ? "▲" : "▼"} {Math.abs(yoyPct).toFixed(1)}%
                  </span>
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${yoyPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtTSigned(tonneDiff)}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground/50 italic">No comparison data</span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/60">
              {comparisonMode === "same_period_ly" ? "Same period last year" : "Previous period"}
            </div>
          </div>
          {sparkData.length >= 2 && (
            <div className="flex-shrink-0 self-end pb-0.5 opacity-80">
              <Sparkline data={sparkData} color="#34d399" />
            </div>
          )}
        </div>
      </KpiCard>

      {/* ── 2. Target Progress ── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <CheckmarkCircle01Icon size={13} className="text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            Target Progress ({periodLabel})
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-extrabold text-foreground leading-none tracking-tight">
              {progressPct.toFixed(1)}%
            </span>
            {yoyPct !== null && (
              <span className={`text-[11px] font-semibold ${yoyPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                vs {compShort}
              </span>
            )}
          </div>
          <div className="mt-1">
            <TargetBar pct={progressPct} />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
              progressPct >= 100 ? "bg-emerald-500/15 text-emerald-400" :
              progressPct >= 70 ? "bg-blue-500/15 text-blue-400" :
              "bg-amber-500/15 text-amber-400"
            }`}>
              {progressPct >= 100 ? "Target achieved!" : `${progressPct.toFixed(0)}% achieved`}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Target: {fmtT(targetTonnes)}
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            {fmtT(totalTonnes)} / {fmtT(targetTonnes)}
            {remaining > 0 && <span className="ml-1 text-amber-400/80">· {fmtT(remaining)} to go</span>}
          </div>
        </div>
      </KpiCard>

      {/* ── 3. Projected EOM ── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <Activity01Icon size={13} className="text-purple-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            {mtd ? `Projected ${mtd.month.split(" ")[0]} EOM` : "Projected Month-End"}
          </span>
        </div>
        {predictiveLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Computing…</div>
        ) : projectedEOM !== null ? (
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[30px] font-extrabold text-foreground leading-none tracking-tight whitespace-nowrap">
                {fmtT(projectedEOM)}
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                vs Target: {fmtT(targetTonnes)}
              </div>
              {projVsTargetPct !== null && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    projVsTargetPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {projVsTargetPct >= 0 ? "▲" : "▼"} {Math.abs(projVsTargetPct).toFixed(1)}%
                  </span>
                  {projVsTarget !== null && (
                    <span className={`text-[11px] font-semibold whitespace-nowrap ${projVsTarget >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtTSigned(projVsTarget)}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-1 text-[10px] text-muted-foreground/55 leading-tight">
                Based on run-rate &amp; same period LY
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

      {/* ── 4. Customer Health ── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <UserGroupIcon size={13} className="text-teal-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            Customer Health ({periodLabel})
          </span>
        </div>
        {predictiveLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Loading…</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-[11px] text-muted-foreground">Healthy</span>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground">{healthyPct}%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-[11px] text-muted-foreground">At Risk</span>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground">{atRiskPct}%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-[11px] text-muted-foreground">Critical</span>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground">{Math.max(critPct, 0)}%</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-border/40">
                <div className="text-[10px] text-muted-foreground">
                  {activeCustomers} active · {atRiskCustomers} at risk
                </div>
              </div>
            </div>
            {(activeCustomers + atRiskCustomers) > 0 && (
              <div className="flex-shrink-0">
                <HealthDonut
                  healthy={healthyCount}
                  atRisk={atRiskOnlyCount}
                  critical={critCount}
                  score={healthScore}
                />
              </div>
            )}
          </div>
        )}
      </KpiCard>

    </div>
  );
}
