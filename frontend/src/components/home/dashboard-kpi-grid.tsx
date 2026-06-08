import {
  ChartUpIcon,
  Activity01Icon,
  UserGroupIcon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";
import type { SalesSummaryMonthlyRow, PredictiveInsightsResponse } from "@/lib/api";

// ── Default target ────────────────────────────────────────────────────────────
// Temporary fallback — wire from Settings/department targets in a future phase.
export const DEFAULT_TARGET_TONNES = 320;

// ── Formatters ────────────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtT = (v: number) => `${nf.format(Math.abs(v))} t`;
const fmtTSigned = (v: number) => `${v >= 0 ? "+" : "-"}${fmtT(v)}`;

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#34d399", w = 104, h = 54 }: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
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
      <polyline
        points={line}
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last point dot */}
      <circle
        cx={pts[pts.length - 1].x}
        cy={pts[pts.length - 1].y}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

// ── Forecast mini-chart ───────────────────────────────────────────────────────
function ForecastChart({ daysElapsed, daysInMonth, actualTonnes, projectedTonnes }: {
  daysElapsed: number;
  daysInMonth: number;
  actualTonnes: number;
  projectedTonnes: number;
}) {
  const W = 124;
  const H = 60;
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
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area under actual */}
      <polygon
        points={`${pL},${by} ${pL},${by} ${tx},${ay} ${tx},${by}`}
        fill="url(#fg)"
      />

      {/* Solid line (actual MTD) */}
      <line x1={pL} y1={by} x2={tx} y2={ay}
        stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" />

      {/* Dashed projected line */}
      <line x1={tx} y1={ay} x2={W - pR} y2={py}
        stroke="#818cf8" strokeWidth="1.8" strokeDasharray="3 2.5" strokeLinecap="round" />

      {/* Projected end dot */}
      <circle cx={W - pR} cy={py} r="2.5" fill="#818cf8" />

      {/* Today vertical marker */}
      <line x1={tx} y1={pT - 2} x2={tx} y2={H - pB}
        stroke="#fbbf24" strokeWidth="1" strokeDasharray="2 2" />
      <text x={tx + 2} y={pT + 1}
        fill="#fbbf24" fontSize="6.5" fontFamily="system-ui" fontWeight="600">Today</text>
    </svg>
  );
}

// ── Donut ring ────────────────────────────────────────────────────────────────
function DonutRing({ active, atRisk }: { active: number; atRisk: number }) {
  const size = 88;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 9;
  const circ = 2 * Math.PI * r;
  const total = active + atRisk || 1;
  const gap = 3; // px gap between segments

  const activeDash = Math.max((active / total) * circ - gap, 0);
  const atRiskDash = Math.max((atRisk / total) * circ - gap, 0);
  const activeOffset = gap / 2;
  const atRiskOffset = -(activeDash + gap * 1.5);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="#21262d" strokeWidth="8" />
      {/* Active (green) */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="#34d399" strokeWidth="8"
        strokeDasharray={`${activeDash} ${circ - activeDash}`}
        strokeDashoffset={activeOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round" />
      {/* At-risk (red) */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="#f87171" strokeWidth="8"
        strokeDasharray={`${atRiskDash} ${circ - atRiskDash}`}
        strokeDashoffset={atRiskOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round" />
      {/* Center: active count */}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill="#e6edf3" fontSize="17" fontWeight="700" fontFamily="system-ui">
        {active}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle"
        fill="#8b949e" fontSize="7.5" fontFamily="system-ui">
        Active
      </text>
    </svg>
  );
}

// ── Segmented progress bar ────────────────────────────────────────────────────
function TargetBar({ pct }: { pct: number }) {
  const fill = Math.min(Math.max(pct, 0), 100);
  const color =
    fill >= 80 ? "#34d399" :
    fill >= 50 ? "#818cf8" :
    fill >= 20 ? "#60a5fa" :
    "#f59e0b";

  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${fill}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }}
      />
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3">
      <div className="h-2.5 w-28 bg-muted/60 rounded" />
      <div className="h-8 w-36 bg-muted/60 rounded" />
      <div className="h-2 w-44 bg-muted/60 rounded" />
    </div>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────
function KpiCard({ children, accentClass = "" }: {
  children: React.ReactNode;
  accentClass?: string;
}) {
  return (
    <div className={`relative rounded-xl border border-border bg-card p-4 overflow-hidden flex flex-col gap-2.5 ${accentClass}`}>
      {children}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface DashboardKpiGridProps {
  totalTonnes: number;
  lyTonnes: number;
  salesRows: SalesSummaryMonthlyRow[];
  mtd: PredictiveInsightsResponse["mtd_projection"] | null;
  atRiskCustomers: number;
  activeCustomers: number;
  targetTonnes?: number;
  loading: boolean;
  predictiveLoading: boolean;
}

// ── Grid ──────────────────────────────────────────────────────────────────────
export default function DashboardKpiGrid({
  totalTonnes,
  lyTonnes,
  salesRows,
  mtd,
  atRiskCustomers,
  activeCustomers,
  targetTonnes = DEFAULT_TARGET_TONNES,
  loading,
  predictiveLoading,
}: DashboardKpiGridProps) {
  // ── Derived ────────────────────────────────────────────────────────────────
  const yoyPct = lyTonnes > 0
    ? ((totalTonnes - lyTonnes) / lyTonnes) * 100
    : null;

  const progressPct = targetTonnes > 0 ? (totalTonnes / targetTonnes) * 100 : 0;
  const remaining = targetTonnes - totalTonnes;

  const projectedEOM = mtd?.projected_eom_tonnes ?? null;
  const projTargetPct = projectedEOM != null && targetTonnes > 0
    ? (projectedEOM / targetTonnes) * 100 : null;
  const projShortfall = projectedEOM != null ? projectedEOM - targetTonnes : null;

  const sparkData = salesRows.map(r => r.total_tonnes);

  // ── Skeletons while loading ────────────────────────────────────────────────
  if (loading && totalTonnes === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton /><Skeleton /><Skeleton /><Skeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* ── 1. Total Tonnes ───────────────────────────────────────────────── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <ChartUpIcon size={13} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Total Tonnes
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[28px] font-extrabold text-foreground leading-none tracking-tight whitespace-nowrap">
              {fmtT(totalTonnes)}
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              {yoyPct !== null ? (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  yoyPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {yoyPct >= 0 ? "↑" : "↓"} {Math.abs(yoyPct).toFixed(1)}% vs LY
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground/50 italic">No prior year data</span>
              )}
            </div>

            {lyTonnes > 0 && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Last year: {fmtT(lyTonnes)}
              </div>
            )}
          </div>

          {sparkData.length >= 2 && (
            <div className="flex-shrink-0 self-end pb-0.5 opacity-80">
              <Sparkline data={sparkData} color="#34d399" />
            </div>
          )}
        </div>
      </KpiCard>

      {/* ── 2. Target Progress ────────────────────────────────────────────── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <CheckmarkCircle01Icon size={13} className="text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Target Progress
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[26px] font-extrabold text-foreground leading-none tracking-tight whitespace-nowrap">
                {fmtT(totalTonnes)}
              </span>
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                / {fmtT(targetTonnes)}
              </span>
            </div>

            <div className="mt-3">
              <TargetBar pct={progressPct} />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                progressPct >= 80 ? "bg-emerald-500/15 text-emerald-400" :
                progressPct >= 40 ? "bg-blue-500/15 text-blue-400" :
                "bg-amber-500/15 text-amber-400"
              }`}>
                {progressPct.toFixed(0)}% achieved
              </span>
            </div>

            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {remaining > 0
                ? <>{fmtT(remaining)} remaining</>
                : <span className="text-emerald-400 font-semibold">Target achieved!</span>
              }
            </div>
          </div>
        </div>
      </KpiCard>

      {/* ── 3. Projected Month-End ────────────────────────────────────────── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <Activity01Icon size={13} className="text-purple-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {mtd ? `Projected ${mtd.month} EOM` : "Projected Month-End"}
          </span>
        </div>

        {predictiveLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Computing…</div>
        ) : projectedEOM !== null ? (
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[28px] font-extrabold text-foreground leading-none tracking-tight whitespace-nowrap">
                {fmtT(projectedEOM)}
              </div>

              {projTargetPct !== null && (
                <div className="mt-2">
                  <span className="text-[11px] font-semibold text-purple-400 whitespace-nowrap">
                    On pace for {projTargetPct.toFixed(0)}% of target
                  </span>
                </div>
              )}

              {projShortfall !== null && (
                <div className="mt-1 text-[11px]">
                  {projShortfall < 0 ? (
                    <span className="text-red-400 font-medium">
                      Shortfall: {fmtTSigned(projShortfall)}
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-medium">
                      Surplus: {fmtTSigned(projShortfall)}
                    </span>
                  )}
                </div>
              )}
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

      {/* ── 4. Customer Health ────────────────────────────────────────────── */}
      <KpiCard>
        <div className="flex items-center gap-2">
          <UserGroupIcon size={13} className="text-teal-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Customer Health
          </span>
        </div>

        {predictiveLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Loading…</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[26px] font-extrabold text-foreground leading-none tracking-tight">
                {activeCustomers}
              </div>
              <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                active customers
              </div>

              <div className="mt-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />
                  {atRiskCustomers} at risk
                </span>
              </div>

              <div className="mt-2.5 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground">Active ({activeCustomers})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground">At risk ({atRiskCustomers})</span>
                </div>
              </div>
            </div>

            {(activeCustomers + atRiskCustomers) > 0 && (
              <div className="flex-shrink-0">
                <DonutRing active={activeCustomers} atRisk={atRiskCustomers} />
              </div>
            )}
          </div>
        )}
      </KpiCard>

    </div>
  );
}
