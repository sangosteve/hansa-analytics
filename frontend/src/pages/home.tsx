import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/lib/theme-context";
import {
  ChartDownIcon,
  Activity01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  ChartUpIcon,
  ArrowRight01Icon,
  Logout01Icon,
  Calendar01Icon,
  Idea01Icon,
  UserGroupIcon,
  ArrowDown01Icon,
} from "hugeicons-react";
import ReactECharts from "echarts-for-react";

import {
  getSalesSummary,
  getPredictiveInsights,
  getRefreshFreshness,
  getMovementSummary,
  getDailySales,
  getTargets,
  type SalesSummaryResponse,
  type PredictiveInsightsResponse,
  type RefreshFreshness,
  type MovementSummary,
  type DailySalesRow,
  type SalesTarget,
} from "@/lib/api";
import DashboardKpiGrid, { DEFAULT_TARGET_TONNES } from "@/components/home/dashboard-kpi-grid";
import CommercialActionCenter from "@/components/home/commercial-action-center";
import AIFloatingDrawer from "@/components/ai/ai-floating-drawer";
import {
  getComparisonPeriod,
  getComparisonBannerText,
  buildComparisonModeLabel,
  type ComparisonMode,
} from "@/lib/comparison-utils";
import { computeActivePeriod } from "@/lib/period-utils";
import { useCompany } from "@/lib/company-context";
import { CustomerDrilldownModal } from "@/components/home/customer-drilldown-modal";

const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const chartColors = ["#3B82F6","#6366F1","#F59E0B","#EF4444","#A78BFA","#60A5FA"];
const divisionColors: Record<string, string> = {
  "3": "#58A6FF",
  "4": "#6366F1",
  "5": "#fb923c",
  "6": "#f87171",
};

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${m[date.getMonth()]}, ${date.getFullYear()}`;
}

function trendIcon(trend: string) {
  if (trend === "growing" || trend === "new") return <ChartUpIcon size={12} className="text-emerald-400" />;
  if (trend === "declining" || trend === "stopped") return <ChartDownIcon size={12} className="text-red-400" />;
  return <Activity01Icon size={12} className="text-yellow-400" />;
}

function trendColor(trend: string) {
  if (trend === "growing" || trend === "new") return "text-emerald-400";
  if (trend === "declining" || trend === "stopped") return "text-red-400";
  return "text-yellow-400";
}

function DataFreshnessIndicator({ freshness }: { freshness: RefreshFreshness | null }) {
  if (!freshness) return null;
  const { status, last_refresh, hours_ago } = freshness;
  let label = "Unknown";
  let dotClass = "bg-muted-foreground/40";
  let textClass = "text-muted-foreground";
  if (status === "ok") {
    dotClass = "bg-emerald-400"; textClass = "text-emerald-400"; label = "Up to date";
  } else if (status === "stale") {
    dotClass = "bg-yellow-400"; textClass = "text-yellow-400";
    label = hours_ago != null ? `${Math.round(hours_ago)}h old` : "Stale";
  } else if (status === "overdue") {
    dotClass = "bg-red-400"; textClass = "text-red-400"; label = "Refresh overdue";
  } else if (status === "unknown" || !last_refresh) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <Clock01Icon size={12} />No data yet
      </span>
    );
  }
  const d = last_refresh ? new Date(last_refresh) : null;
  const timeStr = d ? d.toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const Icon = status === "ok" ? CheckmarkCircle01Icon : status === "overdue" ? AlertCircleIcon : Clock01Icon;
  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-medium ${textClass}`} title={`Last refreshed: ${timeStr}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <Icon size={11} className="flex-shrink-0" />
      {label}
      {timeStr && <span className="text-muted-foreground font-normal hidden sm:inline">· {timeStr}</span>}
    </span>
  );
}

function getChartBase(isDark: boolean) {
  return isDark ? {
    backgroundColor: "transparent",
    textStyle: { color: "#71717A" },
    tooltip: { backgroundColor: "#1F2028", borderColor: "#27272A", textStyle: { color: "#FAFAFA" } },
  } : {
    backgroundColor: "transparent",
    textStyle: { color: "#71717A" },
    tooltip: { backgroundColor: "#FFFFFF", borderColor: "#E4E4E7", textStyle: { color: "#18181B" } },
  };
}

function InsightChip({ label, variant = "neutral" }: { label: string; variant?: "green" | "red" | "amber" | "blue" | "neutral" }) {
  const styles = {
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    neutral: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  return (
    <span className={`inline-flex items-center text-[9.5px] font-medium px-2 py-0.5 rounded-full border ${styles[variant]}`}>
      {label}
    </span>
  );
}

function DropdownBadge({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border bg-secondary text-[11px] text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        {value} <ArrowDown01Icon size={11} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 min-w-[120px] rounded-lg border border-border bg-card shadow-lg py-1">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted transition-colors ${
                o.value === value ? "text-primary font-semibold" : "text-foreground"
              }`}
            >
              {o.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const loadingOverlay = (
  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
    <div className="flex items-center gap-2">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      Loading…
    </div>
  </div>
);

export default function Home() {
  const { companyNos, saleScope, companyLabel, dateFrom, dateTo, isAllTime, setDateRange } = useCompany();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const chartBase = useMemo(() => getChartBase(isDark), [isDark]);

  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null);
  const [momSummary, setMomSummary] = useState<SalesSummaryResponse | null>(null);
  const [predictive, setPredictive] = useState<PredictiveInsightsResponse | null>(null);
  const [movementSummary, setMovementSummary] = useState<MovementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [momLoading, setMomLoading] = useState(true);
  const [predictiveLoading, setPredictiveLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<PredictiveInsightsResponse["customer_lapse_risk"][0] | null>(null);
  const [freshness, setFreshness] = useState<RefreshFreshness | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("same_period_ly");
  const [compSummary, setCompSummary] = useState<SalesSummaryResponse | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesRow[] | null>(null);
  const [compDailySales, setCompDailySales] = useState<DailySalesRow[] | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [cumulView, setCumulView] = useState<"Cumulative" | "Monthly">("Cumulative");
  const [growthView, setGrowthView] = useState<"YoY %" | "Volume">("YoY %");
  const [quarterlyView, setQuarterlyView] = useState<"Quarterly" | "Half Year">("Quarterly");
  const [productSort, setProductSort] = useState<"By Growth" | "By Volume">("By Growth");
  const [chartPeriod, setChartPeriod] = useState<"MTD" | "QTD" | "YTD">("MTD");
  const [chartDailySales, setChartDailySales] = useState<DailySalesRow[] | null>(null);
  const [chartCompDailySales, setChartCompDailySales] = useState<DailySalesRow[] | null>(null);
  const [chartDailyLoading, setChartDailyLoading] = useState(false);
  const [mtdDailySales, setMtdDailySales] = useState<DailySalesRow[] | null>(null);
  const [mtdCompDailySales, setMtdCompDailySales] = useState<DailySalesRow[] | null>(null);

  const loadFiltered = async () => {
    setLoading(true);
    setPredictiveLoading(true);
    setError(null);
    try {
      const { from: compFrom, to: compTo } = getComparisonPeriod(dateFrom, dateTo, comparisonMode);
      const [salesData, predData, compData] = await Promise.all([
        getSalesSummary(dateFrom, dateTo, companyNos, saleScope),
        getPredictiveInsights(companyNos, saleScope),
        getSalesSummary(compFrom, compTo, companyNos, saleScope),
      ]);
      setSummary(salesData);
      setPredictive(predData);
      setCompSummary(compData);
    } catch (err) {
      setError("Unable to load data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
      setPredictiveLoading(false);
    }
  };

  const loadDailySales = async () => {
    if (!dateFrom || !dateTo) return;
    const msPerDay = 86400000;
    const daysDiff = Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / msPerDay);
    if (daysDiff > 62) {
      setDailySales(null);
      setCompDailySales(null);
      return;
    }
    setDailyLoading(true);
    try {
      const { from: compFrom, to: compTo } = getComparisonPeriod(dateFrom, dateTo, comparisonMode);
      const [cur, comp] = await Promise.all([
        getDailySales(dateFrom, dateTo, companyNos, saleScope),
        getDailySales(compFrom, compTo, companyNos, saleScope),
      ]);
      setDailySales(cur);
      setCompDailySales(comp);
    } catch {
      // non-critical
    } finally {
      setDailyLoading(false);
    }
  };

  const loadChartDailySales = async (from: string, to: string) => {
    setChartDailyLoading(true);
    try {
      const { from: compFrom, to: compTo } = getComparisonPeriod(from, to, "same_period_ly");
      const [cur, comp] = await Promise.all([
        getDailySales(from, to, companyNos, saleScope),
        getDailySales(compFrom, compTo, companyNos, saleScope),
      ]);
      setChartDailySales(cur);
      setChartCompDailySales(comp);
    } catch {
      // non-critical
    } finally {
      setChartDailyLoading(false);
    }
  };

  const loadMtdKpiData = async () => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const mtdFrom = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    try {
      const { from: lyFrom, to: lyTo } = getComparisonPeriod(mtdFrom, todayStr, "same_period_ly");
      const [cur, comp] = await Promise.all([
        getDailySales(mtdFrom, todayStr, companyNos, saleScope),
        getDailySales(lyFrom, lyTo, companyNos, saleScope),
      ]);
      setMtdDailySales(cur);
      setMtdCompDailySales(comp);
    } catch {
      // non-critical
    }
  };

  const loadMom = async () => {
    setMomLoading(true);
    try {
      const data = await getSalesSummary("2000-01-01", "2099-12-31", companyNos, saleScope);
      setMomSummary(data);
    } catch {
      // silently keep previous MoM data on error
    } finally {
      setMomLoading(false);
    }
  };

  const loadMovSummary = async () => {
    try {
      const ms = await getMovementSummary(companyNos, saleScope);
      setMovementSummary(ms);
    } catch {
      // non-critical
    }
  };

  const loadFreshness = async () => {
    try {
      const f = await getRefreshFreshness();
      setFreshness(f);
    } catch {
      // non-critical
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFiltered(); loadDailySales(); }, [JSON.stringify(companyNos), saleScope, dateFrom, dateTo, comparisonMode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadMom(); loadMovSummary(); }, [JSON.stringify(companyNos), saleScope]);
  useEffect(() => { loadFreshness(); }, []);
  useEffect(() => {
    getTargets(new Date().getFullYear()).then(setTargets).catch(() => {});
  }, []);

  // Auto-sync chart period to match global date filter when it aligns
  useEffect(() => {
    const period = computeActivePeriod(dateFrom, dateTo);
    if (period === "This Month") setChartPeriod("MTD");
    else if (period === "This Quarter") setChartPeriod("QTD");
    else if (period === "This Year") setChartPeriod("YTD");
  }, [dateFrom, dateTo]);

  // Chart-specific daily data — synced to chart period
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const today = new Date();
    const localDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const todayStr = localDate(today);
    let from: string;
    if (chartPeriod === "MTD") {
      from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    } else if (chartPeriod === "QTD") {
      const qm = Math.floor(today.getMonth() / 3) * 3;
      from = `${today.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`;
    } else {
      from = `${today.getFullYear()}-01-01`;
    }
    loadChartDailySales(from, todayStr);
  }, [chartPeriod, JSON.stringify(companyNos), saleScope]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadMtdKpiData(); }, [JSON.stringify(companyNos), saleScope]);

  useEffect(() => {
    const handler = () => {
      loadFiltered();
      loadDailySales();
      loadMom();
      loadMovSummary();
      loadFreshness();
      loadMtdKpiData();
    };
    window.addEventListener("hansa-data-refreshed", handler);
    return () => window.removeEventListener("hansa-data-refreshed", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope, dateFrom, dateTo]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const salesRows = summary?.monthly_sales ?? [];
  const momRows = momSummary?.monthly_sales ?? [];

  const momYears = useMemo(() => Array.from(new Set(momRows.map(r => r.year))).sort(), [momRows]);
  const currentYear = momYears[momYears.length - 1];
  const previousYear = momYears[momYears.length - 2];
  const todayMonth = new Date().getMonth() + 1;
  const lastCurrentYearMonth = useMemo(() => {
    const rows = momRows.filter(r => r.year === currentYear);
    if (!rows.length) return todayMonth;
    return Math.max(...rows.map(r => r.month));
  }, [momRows, currentYear, todayMonth]);

  const monthlyComparisonData = useMemo(() => {
    const monthMap = new Map<number, Record<string, number | string>>();
    for (let month = 1; month <= 12; month++) monthMap.set(month, { month: monthLabels[month - 1] });
    momRows.forEach(row => {
      const record = monthMap.get(row.month);
      if (!record) return;
      record[`year${row.year}`] = row.total_tonnes;
    });
    return Array.from(monthMap.values());
  }, [momRows]);

  const cumulativeComparisonData = useMemo(() => {
    const yearMonthTotals = new Map<number, number[]>();
    momYears.forEach(year => yearMonthTotals.set(year, Array(12).fill(0)));
    momRows.forEach(row => {
      const totals = yearMonthTotals.get(row.year);
      if (!totals) return;
      totals[row.month - 1] += row.total_tonnes;
    });
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const point: Record<string, number | string> = { month: monthLabels[index] };
      momYears.forEach(year => {
        const totals = yearMonthTotals.get(year) ?? [];
        point[`year${year}`] = totals.slice(0, month).reduce((sum, v) => sum + v, 0);
      });
      return point;
    });
  }, [momRows, momYears]);

  const growthData = useMemo(() => {
    if (!currentYear) return [];
    const curTotals = new Array(12).fill(0);
    const prevTotals = new Array(12).fill(0);
    momRows.forEach(row => {
      if (row.year === currentYear) curTotals[row.month - 1] += row.total_tonnes;
      if (row.year === previousYear) prevTotals[row.month - 1] += row.total_tonnes;
    });
    return curTotals.map((total, index) => {
      const prior = prevTotals[index];
      return { month: monthLabels[index], current: total, growth: prior === 0 ? 0 : ((total - prior) / prior) * 100 };
    });
  }, [currentYear, previousYear, momRows]);

  const totalTonnes = useMemo(() => salesRows.reduce((sum, r) => sum + r.total_tonnes, 0), [salesRows]);
  const comparisonTonnes = useMemo(() => (compSummary?.monthly_sales ?? []).reduce((s, r) => s + r.total_tonnes, 0), [compSummary]);
  const comparisonLabel = buildComparisonModeLabel(dateFrom, dateTo, comparisonMode);

  const todayTonnes = useMemo(() => {
    if (!mtdDailySales || mtdDailySales.length === 0) return 0;
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const tStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    return mtdDailySales.find(r => r.date === tStr)?.tonnes ?? 0;
  }, [mtdDailySales]);

  const mtdTonnes = useMemo(() => {
    if (!mtdDailySales) return 0;
    return mtdDailySales.reduce((s, r) => s + r.tonnes, 0);
  }, [mtdDailySales]);

  const lyMtdTonnes = useMemo(() => {
    if (!mtdCompDailySales) return 0;
    return mtdCompDailySales.reduce((s, r) => s + r.tonnes, 0);
  }, [mtdCompDailySales]);

  const lyTodayTonnes = useMemo(() => {
    if (!mtdCompDailySales || mtdCompDailySales.length === 0) return 0;
    return mtdCompDailySales[mtdCompDailySales.length - 1]?.tonnes ?? 0;
  }, [mtdCompDailySales]);

  const daysInMtd = useMemo(() => new Date().getDate(), []);
  const daysInMonth = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  }, []);

  const divisionBreakdown = summary?.division_breakdown ?? [];

  const quarterlyData = useMemo(() => {
    if (!momRows.length || !currentYear || !previousYear) return [];
    const curQ = [0, 0, 0, 0];
    const prevQ = [0, 0, 0, 0];
    momRows.forEach(r => {
      const qi = Math.floor((r.month - 1) / 3);
      if (r.year === currentYear) curQ[qi] += r.total_tonnes;
      if (r.year === previousYear) prevQ[qi] += r.total_tonnes;
    });
    return (["Q1", "Q2", "Q3", "Q4"] as const).map((q, i) => ({
      q, current: curQ[i], previous: prevQ[i],
      pct: prevQ[i] > 0 ? ((curQ[i] - prevQ[i]) / prevQ[i]) * 100 : 0,
    }));
  }, [momRows, currentYear, previousYear]);

  const momChips = useMemo(() => {
    if (!momRows.length || !currentYear || !previousYear) return null;
    const curT = Array(12).fill(0);
    const prevT = Array(12).fill(0);
    momRows.forEach(r => {
      if (r.year === currentYear) curT[r.month - 1] += r.total_tonnes;
      if (r.year === previousYear) prevT[r.month - 1] += r.total_tonnes;
    });
    const len = lastCurrentYearMonth;
    const curYTD = curT.slice(0, len).reduce((s, v) => s + v, 0);
    const prevYTD = prevT.slice(0, len).reduce((s, v) => s + v, 0);
    const ytdPct = prevYTD > 0 ? ((curYTD - prevYTD) / prevYTD) * 100 : null;
    let peakIdx = 0, peakVal = 0;
    curT.slice(0, len).forEach((v, i) => { if (v > peakVal) { peakVal = v; peakIdx = i; } });
    let dropIdx = -1, maxDrop = 0;
    curT.slice(0, len).forEach((v, i) => {
      const pv = prevT[i];
      if (pv > 0) { const p = ((v - pv) / pv) * 100; if (p < maxDrop) { maxDrop = p; dropIdx = i; } }
    });
    return { ytdPct, peakMonth: peakVal > 0 ? monthLabels[peakIdx] : null, dropMonth: dropIdx >= 0 ? monthLabels[dropIdx] : null };
  }, [momRows, currentYear, previousYear, lastCurrentYearMonth, isDark]);

  const growthChips = useMemo(() => {
    if (!growthData.length) return null;
    const withData = growthData.slice(0, lastCurrentYearMonth).filter(d => d.current > 0);
    if (!withData.length) return null;
    const avg = withData.reduce((s, d) => s + d.current, 0) / withData.length;
    let bestIdx = 0, bestGrowth = -Infinity;
    growthData.slice(0, lastCurrentYearMonth).forEach((d, i) => {
      if (d.current > 0 && d.growth > bestGrowth) { bestGrowth = d.growth; bestIdx = i; }
    });
    const first3 = withData.slice(0, 3).reduce((s, d) => s + d.current, 0) / Math.min(3, withData.length);
    const last3 = withData.slice(-3).reduce((s, d) => s + d.current, 0) / Math.min(3, withData.length);
    const trend = last3 > first3 * 1.05 ? "Growing" : last3 < first3 * 0.95 ? "Declining" : "Stable";
    return { avg, bestMonth: monthLabels[bestIdx], trend };
  }, [growthData, lastCurrentYearMonth]);

  const growthFooter = useMemo(() => {
    const available = growthData.slice(0, lastCurrentYearMonth).filter(d => d.current > 0);
    if (!available.length) return null;
    const mtdGrowth = available[available.length - 1].growth;
    const avgGrowth = available.reduce((s, d) => s + d.growth, 0) / available.length;
    const best = available.reduce((b, d) => d.growth > b.growth ? d : b, available[0]);
    const worst = available.reduce((w, d) => d.growth < w.growth ? d : w, available[0]);
    return {
      mtdGrowth,
      avgGrowth,
      bestMonth: best.month,
      bestPct: best.growth,
      worstMonth: worst.month,
      worstPct: worst.growth,
    };
  }, [growthData, lastCurrentYearMonth]);

  const cumulativeChips = useMemo(() => {
    if (!momRows.length || !currentYear || !previousYear) return null;
    const curYTD = momRows.filter(r => r.year === currentYear && r.month <= lastCurrentYearMonth).reduce((s, r) => s + r.total_tonnes, 0);
    const prevYTD = momRows.filter(r => r.year === previousYear && r.month <= lastCurrentYearMonth).reduce((s, r) => s + r.total_tonnes, 0);
    const vsLYPct = prevYTD > 0 ? ((curYTD - prevYTD) / prevYTD) * 100 : null;
    const gapToLY = prevYTD - curYTD;
    return { curYTD, vsLYPct, gapToLY };
  }, [momRows, currentYear, previousYear, lastCurrentYearMonth, isDark]);

  const cumulativeFooter = useMemo(() => {
    if (!cumulativeChips) return null;
    const annualTarget = DEFAULT_TARGET_TONNES * 12;
    const targetYTD = (lastCurrentYearMonth / 12) * annualTarget;
    const lyYTD = cumulativeChips.curYTD + cumulativeChips.gapToLY;
    const gapToTarget = cumulativeChips.curYTD - targetYTD;
    return {
      ytd: cumulativeChips.curYTD,
      lyYTD,
      gapToLY: -cumulativeChips.gapToLY,
      targetYTD,
      gapToTarget,
      vsLYPct: cumulativeChips.vsLYPct,
    };
  }, [cumulativeChips, lastCurrentYearMonth]);

  // ── Insight bar text ───────────────────────────────────────────────────────
  const insightText = useMemo(() => {
    const parts: string[] = [];
    if (momChips?.ytdPct != null) {
      if (momChips.ytdPct >= 0) {
        parts.push(`You are ahead of last year by ${momChips.ytdPct.toFixed(1)}% year-to-date.`);
      } else {
        parts.push(`You are trailing last year by ${Math.abs(momChips.ytdPct).toFixed(1)}% year-to-date.`);
      }
    }
    const growing = predictive?.product_group_trends.filter(g => g.trend === "growing" || g.trend === "new").sort((a, b) => (b.pct_change ?? 0) - (a.pct_change ?? 0));
    if (growing?.length) {
      parts.push(`${growing[0].name || growing[0].code} is the top growth contributor this period.`);
    }
    const declining = predictive?.product_group_trends.filter(g => g.trend === "declining" || g.trend === "stopped");
    if (declining?.length) {
      parts.push(`${declining[0].name || declining[0].code} is declining — consider a targeted push.`);
    }
    if (predictive?.customer_lapse_risk.length) {
      parts.push(`${predictive.customer_lapse_risk.length} customer${predictive.customer_lapse_risk.length !== 1 ? "s" : ""} need follow-up before lapsing.`);
    }
    return parts.length ? parts.join("  ·  ") : null;
  }, [momChips, predictive]);

  // ── Product groups (filtered) ──────────────────────────────────────────────
  const allProductGroups = useMemo(
    () => predictive?.product_group_trends ?? [],
    [predictive]
  );

  // ── Daily comparison chart ─────────────────────────────────────────────────
  const dailyComparisonOptions = useMemo(() => {
    if (!dailySales || !compDailySales) return null;
    if (dailySales.length === 0 && compDailySales.length === 0) return null;

    const msPerDay = 86400000;
    const fromDate = new Date(dateFrom + "T00:00:00");
    const toDate = new Date(dateTo + "T00:00:00");
    const totalDays = Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay) + 1;

    const { from: compFrom } = getComparisonPeriod(dateFrom, dateTo, comparisonMode);
    const compFromDate = new Date(compFrom + "T00:00:00");

    const curMap = new Map(dailySales.map(r => [r.date, r.cumulative_tonnes]));
    const compMap = new Map(compDailySales.map(r => [r.date, r.cumulative_tonnes]));

    const xLabels: string[] = [];
    const curData: (number | null)[] = [];
    const compData: (number | null)[] = [];

    let lastCur = 0, lastComp = 0;
    const maxCurDay = dailySales.length > 0
      ? Math.round((new Date(dailySales[dailySales.length - 1].date + "T00:00:00").getTime() - fromDate.getTime()) / msPerDay)
      : -1;
    const maxCompDay = compDailySales.length > 0
      ? Math.round((new Date(compDailySales[compDailySales.length - 1].date + "T00:00:00").getTime() - compFromDate.getTime()) / msPerDay)
      : -1;

    for (let i = 0; i < totalDays; i++) {
      const curDate = new Date(fromDate.getTime() + i * msPerDay);
      const compDate = new Date(compFromDate.getTime() + i * msPerDay);
      const curKey = curDate.toISOString().slice(0, 10);
      const compKey = compDate.toISOString().slice(0, 10);
      xLabels.push(`${String(curDate.getDate()).padStart(2)} ${monthLabels[curDate.getMonth()]}`);
      if (curMap.has(curKey)) lastCur = curMap.get(curKey)!;
      if (compMap.has(compKey)) lastComp = compMap.get(compKey)!;
      curData.push(i <= maxCurDay ? lastCur : null);
      compData.push(i <= maxCompDay ? lastComp : null);
    }

    const curFinal = curData.filter(v => v !== null);
    const compFinal = compData.filter(v => v !== null);
    const curEnd = curFinal.length > 0 ? curFinal[curFinal.length - 1] as number : 0;
    const compEnd = compFinal.length > 0 ? compFinal[compFinal.length - 1] as number : 0;
    const diffPct = compEnd > 0 ? ((curEnd - compEnd) / compEnd) * 100 : null;

    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: { show: false },
      grid: { left: "8%", right: "5%", bottom: "12%", top: "10%" },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9,
          interval: Math.max(1, Math.floor(totalDays / 8) - 1) },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: (v: number) => `${v} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: "This Year",
          type: "line",
          data: curData,
          connectNulls: false,
          smooth: false,
          lineStyle: { width: 2.5, color: "#3B82F6" },
          itemStyle: { color: "#3B82F6" },
          showSymbol: true,
          symbol: "circle",
          symbolSize: 5,
          label: {
            show: true,
            position: "top",
            fontSize: 8.5,
            color: "#3B82F6",
            // @ts-ignore
            formatter: (p: any) => p.value != null ? `${numberFormatter.format(p.value)}` : "",
          },
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: "#3B82F630" }, { offset: 1, color: "transparent" }],
            },
          },
          endLabel: {
            show: false,
          },
        },
        {
          name: "Last Year",
          type: "line",
          data: compData,
          connectNulls: false,
          smooth: false,
          lineStyle: { width: 1.5, color: "#6b7280", type: "dashed" },
          itemStyle: { color: "#6b7280" },
          showSymbol: false,
          label: {
            show: true,
            position: "bottom",
            fontSize: 8,
            color: "#6b7280",
            // @ts-ignore
            formatter: (p: any) => p.value != null ? `${numberFormatter.format(p.value)}` : "",
          },
          endLabel: {
            show: false,
          },
        },
      ],
      _curEnd: curEnd,
      _compEnd: compEnd,
      _diffPct: diffPct,
    };
  }, [dailySales, compDailySales, dateFrom, dateTo, comparisonMode, isDark]);

  // ── Chart-specific daily comparison (isolated from global date range) ───────
  const { chartFrom, chartTo } = useMemo(() => {
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    if (chartPeriod === "MTD") {
      return { chartFrom: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, chartTo: todayISO };
    } else if (chartPeriod === "QTD") {
      const qm = Math.floor(today.getMonth() / 3) * 3;
      return { chartFrom: `${today.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`, chartTo: todayISO };
    }
    return { chartFrom: `${today.getFullYear()}-01-01`, chartTo: todayISO };
  }, [chartPeriod]);

  const chartThisYearLabel = useMemo(() => {
    const d = new Date(chartFrom + "T00:00:00");
    return `${monthLabels[d.getMonth()]} ${d.getFullYear()}`;
  }, [chartFrom]);

  const chartLastYearLabel = useMemo(() => {
    const { from: compFrom } = getComparisonPeriod(chartFrom, chartTo, "same_period_ly");
    const d = new Date(compFrom + "T00:00:00");
    return `${monthLabels[d.getMonth()]} ${d.getFullYear()}`;
  }, [chartFrom, chartTo]);

  const chartDailyComparisonOptions = useMemo(() => {
    if (!chartDailySales || !chartCompDailySales) return null;
    if (chartDailySales.length === 0 && chartCompDailySales.length === 0) return null;
    const msPerDay = 86400000;
    const fromDate = new Date(chartFrom + "T00:00:00");
    const toDate = new Date(chartTo + "T00:00:00");
    const totalDays = Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay) + 1;
    const { from: compFrom } = getComparisonPeriod(chartFrom, chartTo, "same_period_ly");
    const compFromDate = new Date(compFrom + "T00:00:00");
    const curDailyMap = new Map(chartDailySales.map(r => [r.date, r.tonnes]));
    const compDailyMap = new Map(chartCompDailySales.map(r => [r.date, r.tonnes]));
    const xLabels: string[] = [];
    const curData: (number | null)[] = [];
    const compData: (number | null)[] = [];
    const maxCurDay = chartDailySales.length > 0
      ? Math.round((new Date(chartDailySales[chartDailySales.length - 1].date + "T00:00:00").getTime() - fromDate.getTime()) / msPerDay)
      : -1;
    const maxCompDay = chartCompDailySales.length > 0
      ? Math.round((new Date(chartCompDailySales[chartCompDailySales.length - 1].date + "T00:00:00").getTime() - compFromDate.getTime()) / msPerDay)
      : -1;
    for (let i = 0; i < totalDays; i++) {
      const curDate = new Date(fromDate.getTime() + i * msPerDay);
      const compDate = new Date(compFromDate.getTime() + i * msPerDay);
      const curKey = curDate.toISOString().slice(0, 10);
      const compKey = compDate.toISOString().slice(0, 10);
      xLabels.push(`${String(curDate.getDate()).padStart(2)} ${monthLabels[curDate.getMonth()]}`);
      curData.push(i <= maxCurDay ? (curDailyMap.get(curKey) ?? 0) : null);
      compData.push(i <= maxCompDay ? (compDailyMap.get(compKey) ?? 0) : null);
    }
    const curEnd = chartDailySales.reduce((s, r) => s + r.tonnes, 0);
    const compEnd = chartCompDailySales.reduce((s, r) => s + r.tonnes, 0);
    const diffPct = compEnd > 0 ? ((curEnd - compEnd) / compEnd) * 100 : null;
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip, trigger: "axis",
        // @ts-ignore
        formatter: (params) => params.filter(item => item.value != null && item.value > 0)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`).join("<br />"),
      },
      legend: { show: false },
      grid: { left: "8%", right: "8%", bottom: "12%", top: "10%" },
      xAxis: {
        type: "category", data: xLabels,
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, interval: Math.max(1, Math.floor(totalDays / 8) - 1) },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: (v: number) => `${v} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      graphic: curEnd > 0 ? [{
        type: "group", right: 10, top: 6,
        children: [
          { type: "rect", z: 100, shape: { width: 100, height: 18, r: 3 }, style: { fill: "#3B82F615", stroke: "#3B82F640", lineWidth: 1 } },
          { type: "text", z: 101, style: { text: `Total: ${numberFormatter.format(Math.round(curEnd * 100) / 100)} t`, fill: "#3B82F6", fontSize: 9, fontWeight: "bold", x: 7, y: 3 } },
        ]
      }] : [],
      series: [
        {
          name: "This Year", type: "line", data: curData, connectNulls: false, smooth: false,
          lineStyle: { width: 2.5, color: "#3B82F6" }, itemStyle: { color: "#3B82F6" },
          showSymbol: true, symbol: "circle", symbolSize: 5,
          label: { show: true, position: "top", fontSize: 8.5, color: "#3B82F6",
            // @ts-ignore
            formatter: (p: any) => p.value != null && p.value > 0 ? numberFormatter.format(p.value) : "" },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: "#3B82F630" }, { offset: 1, color: "transparent" }] } },
        },
        {
          name: "Last Year", type: "line", data: compData, connectNulls: false, smooth: false,
          lineStyle: { width: 1.5, color: "#6b7280", type: "dashed" }, itemStyle: { color: "#6b7280" },
          showSymbol: false,
          label: { show: false },
        },
      ],
      _curEnd: curEnd,
      _compEnd: compEnd,
      _diffPct: diffPct,
    };
  }, [chartDailySales, chartCompDailySales, chartFrom, chartTo, isDark]);

  // ── MTD Daily Performance — combo chart (bars=daily, solid line=cumul actual, dashed=cumul LY) ──
  const chartMtdOptions = useMemo(() => {
    if (chartPeriod !== "MTD") return null;
    if (!chartDailySales || chartDailySales.length === 0) return null;
    const xLabels = chartDailySales.map(r => {
      const d = new Date(r.date + "T00:00:00");
      return `${String(d.getDate()).padStart(2, "0")} ${monthLabels[d.getMonth()]}`;
    });
    const barData = chartDailySales.map(r => Math.round(r.tonnes * 100) / 100);
    const lineData = chartDailySales.map(r => Math.round(r.cumulative_tonnes * 100) / 100);
    const lyLineData = chartDailySales.map((_: any, i: number) => {
      const comp = mtdCompDailySales?.[i];
      return comp != null ? Math.round(comp.cumulative_tonnes * 100) / 100 : null;
    });
    const lastLyIdx = lyLineData.reduce((acc: number, v: number | null, i: number) => v != null ? i : acc, -1);
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const idx = params[0].dataIndex;
          const dateLbl = chartDailySales[idx]
            ? (() => {
                const d = new Date(chartDailySales[idx].date + "T00:00:00");
                return `${String(d.getDate()).padStart(2, "0")} ${monthLabels[d.getMonth()]} ${d.getFullYear()}`;
              })()
            : "";
          const lines = params
            .filter((p: any) => p.value != null && p.value > 0)
            .map((p: any) => `<span style="display:inline-block;width:8px;height:8px;border-radius:${p.componentSubType === 'bar' ? '2px' : '50%'};background:${p.color};margin-right:4px;vertical-align:middle"></span>${p.seriesName}: <strong>${numberFormatter.format(p.value)} t</strong>`);
          return `<div style="font-weight:600;margin-bottom:4px;color:#e6edf3">${dateLbl}</div>${lines.join("<br />")}`;
        },
      },
      legend: {
        data: ["Daily Tonnes (Actual)", "Cumulative MTD (Actual)", "Cumulative MTD (LY)"],
        top: 4,
        textStyle: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9 },
      },
      grid: { left: "8%", right: "8%", bottom: "12%", top: "22%" },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, interval: Math.max(0, Math.floor(chartDailySales.length / 8) - 1) },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: "value",
          name: "Daily t",
          nameTextStyle: { color: isDark ? "#8b949e" : "#71717A", fontSize: 8 },
          axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 8, formatter: (v: number) => `${numberFormatter.format(v)}` },
          splitLine: { lineStyle: { color: "#21262d" } },
        },
        {
          type: "value",
          name: "Cumul t",
          nameTextStyle: { color: isDark ? "#8b949e" : "#71717A", fontSize: 8 },
          axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 8, formatter: (v: number) => `${numberFormatter.format(v)}` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Daily Tonnes (Actual)",
          type: "bar",
          data: barData,
          yAxisIndex: 0,
          itemStyle: { color: "#3B82F6", borderRadius: [2, 2, 0, 0] },
          label: {
            show: true,
            position: "top",
            fontSize: 7.5,
            color: "#3B82F6",
            // @ts-ignore
            formatter: (p: any) => p.value != null && p.value > 0 ? numberFormatter.format(p.value) : "",
          },
        },
        {
          name: "Cumulative MTD (Actual)",
          type: "line",
          data: lineData,
          yAxisIndex: 1,
          smooth: false,
          lineStyle: { color: "#3B82F6", width: 2 },
          itemStyle: { color: "#3B82F6" },
          showSymbol: true,
          symbol: "circle",
          symbolSize: 4,
          label: {
            show: true,
            position: "top",
            fontSize: 7.5,
            color: "#3B82F6",
            // @ts-ignore
            formatter: (p: any) => p.dataIndex === lineData.length - 1 && p.value != null && p.value > 0
              ? numberFormatter.format(p.value) : "",
          },
        },
        {
          name: "Cumulative MTD (LY)",
          type: "line",
          data: lyLineData,
          yAxisIndex: 1,
          smooth: false,
          connectNulls: false,
          lineStyle: { color: isDark ? "#8b949e" : "#71717A", width: 1.5, type: "dashed" },
          itemStyle: { color: isDark ? "#8b949e" : "#71717A" },
          showSymbol: true,
          symbol: "circle",
          symbolSize: 3,
          label: {
            show: true,
            position: "top",
            fontSize: 7.5,
            color: isDark ? "#8b949e" : "#71717A",
            // @ts-ignore
            formatter: (p: any) => p.dataIndex === lastLyIdx && p.value != null && p.value > 0
              ? numberFormatter.format(p.value) : "",
          },
        },
      ],
    };
  }, [chartPeriod, chartDailySales, mtdCompDailySales, isDark]);

  // ── QTD monthly bar chart ──────────────────────────────────────────────────
  const chartQtdBarOptions = useMemo(() => {
    if (chartPeriod !== "QTD" || !chartDailySales || !chartCompDailySales) return null;
    if (chartDailySales.length === 0 && chartCompDailySales.length === 0) return null;
    const from = new Date(chartFrom + "T00:00:00");
    const qStartMonth = Math.floor(from.getMonth() / 3) * 3;
    const months = [qStartMonth, qStartMonth + 1, qStartMonth + 2];
    const monthNames = months.map(m => monthLabels[m]);
    const curMonthly: Record<number, number> = {};
    chartDailySales.forEach(r => {
      const m = new Date(r.date + "T00:00:00").getMonth();
      curMonthly[m] = (curMonthly[m] ?? 0) + r.tonnes;
    });
    const compMonthly: Record<number, number> = {};
    chartCompDailySales.forEach(r => {
      const m = new Date(r.date + "T00:00:00").getMonth();
      compMonthly[m] = (compMonthly[m] ?? 0) + r.tonnes;
    });
    const curBars = months.map(m => Math.round((curMonthly[m] ?? 0) * 100) / 100);
    const compBars = months.map(m => Math.round((compMonthly[m] ?? 0) * 100) / 100);
    const curTotal = curBars.reduce((s, v) => s + v, 0);
    const compTotal = compBars.reduce((s, v) => s + v, 0);
    const diffPct = compTotal > 0 ? ((curTotal - compTotal) / compTotal) * 100 : null;
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip, trigger: "axis",
        // @ts-ignore
        formatter: (params: any) => params
          .filter((item: any) => item.value > 0)
          .map((item: any) => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: { show: false },
      grid: { left: "8%", right: "5%", bottom: "12%", top: "10%" },
      xAxis: {
        type: "category", data: monthNames,
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: (v: number) => `${v} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: `This Year (${from.getFullYear()})`,
          type: "bar", data: curBars, barMaxWidth: 56,
          itemStyle: { color: "#3B82F6", borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: "top", fontSize: 9, color: "#3B82F6",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? numberFormatter.format(p.value) : "" },
        },
        {
          name: `Last Year (${from.getFullYear() - 1})`,
          type: "bar", data: compBars, barMaxWidth: 56,
          itemStyle: { color: "#6b728055", borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: "top", fontSize: 8.5, color: "#6b7280",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? numberFormatter.format(p.value) : "" },
        },
      ],
      _curEnd: curTotal,
      _compEnd: compTotal,
      _diffPct: diffPct,
    };
  }, [chartPeriod, chartDailySales, chartCompDailySales, chartFrom, isDark]);

  // ── Monthly comparison chart ───────────────────────────────────────────────
  const monthlyComparisonOptions = useMemo(() => ({
    ...chartBase,
    tooltip: {
      ...chartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) => params
        // @ts-ignore
        .filter(item => item.value != null)
        // @ts-ignore
        .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
        .join("<br />"),
    },
    legend: { data: momYears.map(y => String(y)), top: "4%", textStyle: { color: isDark ? "#8b949e" : "#71717A" } },
    grid: { left: "8%", right: "4%", bottom: "14%", top: "18%" },
    xAxis: {
      type: "category",
      data: monthlyComparisonData.map(d => d.month),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: isDark ? "#8b949e" : "#71717A" },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: "Tonnes",
      nameTextStyle: { color: isDark ? "#8b949e" : "#71717A" },
      axisLabel: { color: isDark ? "#8b949e" : "#71717A" },
      splitLine: { lineStyle: { color: "#21262d" } },
    },
    series: momYears.map((year, index) => ({
      name: String(year),
      type: "line",
      data: monthlyComparisonData.map((d, idx) => {
        if (year === currentYear && idx + 1 > lastCurrentYearMonth) return null;
        const v = d[`year${year}`];
        return v != null ? v : null;
      }),
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2, color: chartColors[index % chartColors.length] },
      itemStyle: { color: chartColors[index % chartColors.length] },
      showSymbol: false,
      symbol: "circle",
      symbolSize: 4,
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${chartColors[index % chartColors.length]}28` },
            { offset: 1, color: "transparent" },
          ],
        },
      },
      ...(year === currentYear && lastCurrentYearMonth > 0 ? {
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { color: "#fbbf24", type: "dashed", width: 1, opacity: 0.75 },
          label: {
            position: "insideStartTop",
            fontSize: 9,
            color: "#fbbf24",
            formatter: "Today",
            padding: [2, 4],
            backgroundColor: "#1c212880",
            borderRadius: 3,
          },
          data: [{ xAxis: monthLabels[lastCurrentYearMonth - 1] }],
        },
      } : {}),
    })),
  }), [monthlyComparisonData, momYears, currentYear, lastCurrentYearMonth]);

  const growthOptions = useMemo(() => ({
    ...chartBase,
    tooltip: {
      ...chartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) => params
        // @ts-ignore
        .filter(item => item.value != null)
        // @ts-ignore
        .map(item => `${item.seriesName}: ${Number(item.value).toFixed(1)}%`)
        .join("<br />"),
    },
    grid: { left: "8%", right: "4%", bottom: "14%", top: "12%" },
    xAxis: {
      type: "category",
      data: growthData.map(d => d.month),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      nameTextStyle: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9 },
      axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#21262d" } },
    },
    series: [{
      name: "YoY Growth",
      type: "bar",
      data: growthData.map((d, idx) => {
        if (idx + 1 > lastCurrentYearMonth || d.current === 0) return null;
        const g = Number(d.growth.toFixed(1));
        return {
          value: g,
          itemStyle: {
            color: g >= 0 ? "#3B82F6" : "#f87171",
            borderRadius: g >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
          },
        };
      }),
      label: {
        show: true,
        // @ts-ignore
        position: (p: any) => (p.data?.value ?? 0) >= 0 ? "top" : "bottom",
        fontSize: 8,
        color: isDark ? "#8b949e" : "#71717A",
        // @ts-ignore
        formatter: (p: any) => p.data?.value != null ? `${p.data.value.toFixed(0)}%` : "",
      },
    }],
  }), [growthData, lastCurrentYearMonth]);

  const growthVolumeOptions = useMemo(() => {
    if (!currentYear || !previousYear) return null;
    const curData = Array(12).fill(0);
    const prevData = Array(12).fill(0);
    momRows.forEach(r => {
      if (r.year === currentYear) curData[r.month - 1] = r.total_tonnes;
      if (r.year === previousYear) prevData[r.month - 1] = r.total_tonnes;
    });
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null && item.value > 0)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      grid: { left: "8%", right: "4%", bottom: "14%", top: "12%" },
      xAxis: {
        type: "category",
        data: monthLabels,
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: (v: number) => `${v} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: String(currentYear),
          type: "bar",
          data: curData.map((v, i) => (i + 1 <= lastCurrentYearMonth && v > 0 ? v : null)),
          itemStyle: { color: "#3B82F6", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: { show: false },
        },
        {
          name: String(previousYear),
          type: "bar",
          data: prevData.map(v => (v > 0 ? v : null)),
          itemStyle: { color: "#4b5563", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: { show: false },
        },
      ],
    };
  }, [momRows, currentYear, previousYear, lastCurrentYearMonth, isDark]);

  const cumulativeComparisonOptions = useMemo(() => {
    const annualTarget = DEFAULT_TARGET_TONNES * 12;
    const targetData = Array.from({ length: 12 }, (_, i) => (i + 1) * (annualTarget / 12));
    const yearColor = (year: number) => (year === currentYear ? "#3B82F6" : "#6b7280");
    const baseSeries = momYears.map((year) => ({
      name: String(year),
      type: "line",
      data: cumulativeComparisonData.map((d, idx) => {
        if (year === currentYear && idx + 1 > lastCurrentYearMonth) return null;
        const v = d[`year${year}`];
        return v != null ? v : null;
      }),
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2, color: yearColor(year), type: year === currentYear ? "solid" : "dashed" },
      itemStyle: { color: yearColor(year) },
      showSymbol: false,
      endLabel: {
        show: true,
        fontSize: 9,
        color: yearColor(year),
        // @ts-ignore
        formatter: (p: any) => p.value != null && p.value > 0 ? `${numberFormatter.format(p.value)} t` : "",
      },
      areaStyle: year === currentYear ? {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "#3B82F620" },
            { offset: 1, color: "transparent" },
          ],
        },
      } : undefined,
      ...(year === currentYear && lastCurrentYearMonth > 0 ? {
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { color: "#fbbf24", type: "dashed", width: 1, opacity: 0.75 },
          label: {
            position: "insideStartTop",
            fontSize: 9,
            color: "#fbbf24",
            formatter: (() => {
              const d = dateTo ? new Date(dateTo) : new Date();
              const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              return `${d.getDate()} ${m[d.getMonth()]}`;
            })(),
            padding: [2, 4],
            backgroundColor: "#1c212880",
            borderRadius: 3,
          },
          data: [{ xAxis: monthLabels[lastCurrentYearMonth - 1] }],
        },
      } : {}),
    }));
    const targetSeries = {
      name: `Target ${currentYear ?? ""}`,
      type: "line",
      data: targetData,
      lineStyle: { type: "dashed", color: "#fb923c", width: 1.5 },
      itemStyle: { color: "#fb923c" },
      showSymbol: false,
      endLabel: {
        show: true,
        fontSize: 9,
        color: "#fb923c",
        // @ts-ignore
        formatter: (p: any) => p.value != null ? `Target: ${numberFormatter.format(p.value)} t` : "",
      },
    };
    // YTD Average (running average pace projected linearly across the year)
    const curYTD = cumulativeComparisonData
      .map((d) => (d[`year${currentYear}`] as number) ?? 0)
      .slice(0, lastCurrentYearMonth);
    const avgPerMonth = curYTD.length > 0 ? (curYTD[curYTD.length - 1] ?? 0) / lastCurrentYearMonth : 0;
    const ytdAverageData = Array.from({ length: 12 }, (_, i) => avgPerMonth * (i + 1));
    const ytdAverageSeries = {
      name: `YTD Average ${currentYear ?? ""}`,
      type: "line",
      data: ytdAverageData,
      lineStyle: { type: "dashed", color: "#38bdf8", width: 1.5 },
      itemStyle: { color: "#38bdf8" },
      showSymbol: false,
    };
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: { show: false },
      grid: { left: "8%", right: "12%", bottom: "8%", top: "8%" },
      xAxis: {
        type: "category",
        data: cumulativeComparisonData.map(d => d.month),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", formatter: (v: number) => `${numberFormatter.format(v)} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [...baseSeries, targetSeries, ytdAverageSeries],
    };
  }, [cumulativeComparisonData, momYears, currentYear, lastCurrentYearMonth, dateTo]);

  const quarterlyChartOptions = useMemo(() => {
    if (!quarterlyData.length) return null;
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null && item.value > 0)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: { show: false },
      grid: { left: "12%", right: "4%", bottom: "12%", top: "12%" },
      xAxis: {
        type: "category",
        data: quarterlyData.map(d => d.q),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: (v: number) => `${numberFormatter.format(v)} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: String(currentYear ?? "Current"),
          type: "bar",
          data: quarterlyData.map(d => d.current > 0 ? d.current : null),
          itemStyle: { color: "#3B82F6", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            fontWeight: "bold",
            color: "#e6edf3",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? `${numberFormatter.format(p.value)}` : "",
          },
        },
        {
          name: String(previousYear ?? "Prior"),
          type: "bar",
          data: quarterlyData.map(d => d.previous),
          itemStyle: { color: "#4b5563", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            color: isDark ? "#8b949e" : "#71717A",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? `${numberFormatter.format(p.value)}` : "",
          },
        },
      ],
    };
  }, [quarterlyData, currentYear, previousYear]);

  const halfYearData = useMemo(() => {
    if (!quarterlyData.length) return [];
    const h1Cur = quarterlyData.slice(0, 2).reduce((s, q) => s + q.current, 0);
    const h2Cur = quarterlyData.slice(2, 4).reduce((s, q) => s + q.current, 0);
    const h1Prev = quarterlyData.slice(0, 2).reduce((s, q) => s + q.previous, 0);
    const h2Prev = quarterlyData.slice(2, 4).reduce((s, q) => s + q.previous, 0);
    return [
      { h: "H1 (Q1+Q2)", current: h1Cur, previous: h1Prev, pct: h1Prev > 0 ? ((h1Cur - h1Prev) / h1Prev) * 100 : 0 },
      { h: "H2 (Q3+Q4)", current: h2Cur, previous: h2Prev, pct: h2Prev > 0 ? ((h2Cur - h2Prev) / h2Prev) * 100 : 0 },
    ];
  }, [quarterlyData]);

  const halfYearChartOptions = useMemo(() => {
    if (!halfYearData.length) return null;
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null && item.value > 0)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: { show: false },
      grid: { left: "12%", right: "4%", bottom: "12%", top: "12%" },
      xAxis: {
        type: "category",
        data: halfYearData.map(d => d.h),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: isDark ? "#8b949e" : "#71717A" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: isDark ? "#8b949e" : "#71717A", fontSize: 9, formatter: (v: number) => `${numberFormatter.format(v)} t` },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: String(currentYear ?? "Current"),
          type: "bar",
          data: halfYearData.map(d => d.current > 0 ? d.current : null),
          itemStyle: { color: "#3B82F6", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: {
            show: true, position: "top", fontSize: 9, fontWeight: "bold", color: "#e6edf3",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? `${numberFormatter.format(p.value)}` : "",
          },
        },
        {
          name: String(previousYear ?? "Prior"),
          type: "bar",
          data: halfYearData.map(d => d.previous > 0 ? d.previous : null),
          itemStyle: { color: "#4b5563", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: {
            show: true, position: "top", fontSize: 9, color: isDark ? "#8b949e" : "#71717A",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? `${numberFormatter.format(p.value)}` : "",
          },
        },
      ],
    };
  }, [halfYearData, currentYear, previousYear]);

  const currentMonthTarget = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const singleCompany = companyNos.length === 1 && !companyNos.includes("all") ? companyNos[0] : null;
    return (
      // Exact match: company + scope
      targets.find(t => t.year === year && t.month === month && t.company_no === singleCompany && t.scope === saleScope) ??
      // Global company + exact scope
      targets.find(t => t.year === year && t.month === month && t.company_no === null && t.scope === saleScope) ??
      // Company + "all" scope
      targets.find(t => t.year === year && t.month === month && t.company_no === singleCompany && t.scope === "all") ??
      // Global company + "all" scope
      targets.find(t => t.year === year && t.month === month && t.company_no === null && t.scope === "all") ??
      // Best available: any target for this month (company-specific first)
      targets.find(t => t.year === year && t.month === month && t.company_no === singleCompany) ??
      targets.find(t => t.year === year && t.month === month && t.company_no === null) ??
      null
    );
  }, [targets, companyNos, saleScope]);

  const divisionChartOptions = useMemo(() => {
    if (!divisionBreakdown.length) return null;
    const total = divisionBreakdown.reduce((s, d) => s + d.total_tonnes, 0);
    return {
      ...chartBase,
      tooltip: {
        ...chartBase.tooltip,
        trigger: "item",
        // @ts-ignore
        formatter: (p) => `${p.name}: ${numberFormatter.format(p.value)} t (${p.percent}%)`,
      },
      graphic: [{
        type: "group", left: "29%", top: "middle",
        children: [
          { type: "text", z: 100, left: "center", top: -14, style: { text: "Total", fill: "#8b949e", fontSize: 10, fontFamily: "system-ui", textAlign: "center" } },
          { type: "text", z: 100, left: "center", top: 2, style: { text: `${numberFormatter.format(total)} t`, fill: "#e6edf3", fontSize: 14, fontWeight: "bold", fontFamily: "system-ui", textAlign: "center" } },
        ],
      }],
      series: [{
        name: "Division",
        type: "pie",
        radius: ["40%", "66%"],
        center: ["30%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: "#161b22", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: "bold", color: "#e6edf3" } },
        labelLine: { show: false },
        data: divisionBreakdown.map(d => ({
          name: d.label,
          value: d.total_tonnes,
          itemStyle: { color: divisionColors[d.company_no] ?? "#58A6FF" },
        })),
      }],
    };
  }, [divisionBreakdown]);

  // ── Derived for KPI card ───────────────────────────────────────────────────
  const criticalCustomers = useMemo(
    () => predictive?.customer_lapse_risk.filter(c => c.revenue_tier === "high").length ?? 0,
    [predictive]
  );

  // ── Filter bar helpers ─────────────────────────────────────────────────────
  const msPerDay = 86400000;
  const dateDiff = dateFrom && dateTo
    ? Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / msPerDay)
    : null;
  const showDailyChart = dateDiff !== null && dateDiff <= 62;

  const todayLabel = (() => {
    const d = new Date();
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(d.getDate()).padStart(2, "0")} ${m[d.getMonth()]} ${d.getFullYear()}`;
  })();

  const lastUpdatedLabel = (() => {
    const d = freshness?.last_refresh ? new Date(freshness.last_refresh) : new Date();
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `${String(d.getDate()).padStart(2, "0")} ${m[d.getMonth()]} ${d.getFullYear()}, ${time}`;
  })();

  const filterPeriodLabel = (() => {
    if (!dateFrom || !dateTo) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00"); to.setHours(0, 0, 0, 0);
    if (from.getFullYear() === today.getFullYear() && from.getMonth() === today.getMonth() && from.getDate() === 1 && to.getTime() === today.getTime()) return "MTD";
    if (from.getFullYear() === today.getFullYear() && from.getMonth() === 0 && from.getDate() === 1 && to.getTime() === today.getTime()) return "YTD";
    const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    if (from.getTime() === qStart.getTime() && to.getTime() === today.getTime()) return "QTD";
    return "";
  })();

  // Month-aware labels for the MTD daily chart legend, e.g. "Jun 2025" / "Jun 2024"
  const dailyThisYearLabel = (() => {
    if (!dateFrom) return `${currentYear ?? ""}`;
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const d = new Date(dateFrom);
    return `${m[d.getMonth()]} ${d.getFullYear()}`;
  })();
  const dailyLastYearLabel = (() => {
    if (!dateFrom) return `${previousYear ?? ""}`;
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const d = new Date(dateFrom);
    return `${m[d.getMonth()]} ${d.getFullYear() - 1}`;
  })();

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 md:p-5 space-y-4">

          {/* ── Page Header ── */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center justify-center leading-none">
                <span className="text-[20px] font-extrabold tracking-tight text-foreground">PSS</span>
                <span className="text-[8px] font-semibold tracking-[0.2em] text-muted-foreground/70 -mt-0.5">DASHBOARD</span>
              </div>
              <div className="h-9 w-px bg-border" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Commercial Overview</h1>
                  <span className="text-[14px] text-muted-foreground/50 cursor-help" title="Real-time analytics from your Hansa ERP data">ⓘ</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Real-time performance as of today</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Last updated: {lastUpdatedLabel}
                <DataFreshnessIndicator freshness={freshness} />
              </div>
              <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-[12px] font-medium text-foreground">
                {todayLabel}
                <Calendar01Icon size={13} className="text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* ── Filter / Comparison Bar ── */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
              {/* Compare With (comparison mode) */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">Compare With</span>
                <select
                  value={comparisonMode}
                  onChange={e => setComparisonMode(e.target.value as ComparisonMode)}
                  className="h-9 px-2.5 text-[12px] rounded-lg border border-border bg-muted text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-ring/30 cursor-pointer min-w-[200px]"
                >
                  <option value="same_period_ly">
                    {filterPeriodLabel ? `${filterPeriodLabel} vs LY ${filterPeriodLabel} (Same Day)` : "Same Period (Last Year)"}
                  </option>
                  <option value="previous_period">Previous Period</option>
                </select>
              </div>

              {/* Clear Filters — always visible */}
              <div className="flex flex-col gap-1 ml-auto">
                <span className="text-[10px] text-transparent select-none">·</span>
                <button
                  onClick={() => { setComparisonMode("same_period_ly"); }}
                  className="h-9 px-3 flex items-center text-[12px] rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Comparison banner */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-primary/15 bg-primary/5 text-[12px]">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-[11px] leading-none">i</span>
              <span className="text-muted-foreground flex-1 min-w-0">
                <span className="text-primary font-semibold">{computeActivePeriod(dateFrom, dateTo)}</span>
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                <span className="text-muted-foreground/70">
                  {comparisonMode === "previous_period"
                    ? "same-length prior period:"
                    : "same equivalent period last year:"}
                </span>
                {" "}
                <span className="text-foreground/85 font-medium">
                  {getComparisonBannerText(dateFrom, dateTo, comparisonMode)}
                </span>
              </span>
              <button
                className="flex-shrink-0 text-primary/60 hover:text-primary transition-colors whitespace-nowrap text-[11px]"
                title="Same-period comparison aligns both periods to the same calendar days so you compare like-for-like, not a partial month against a full month."
              >
                Why same-period comparison? ⓘ
              </button>
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <DashboardKpiGrid
            totalTonnes={totalTonnes}
            comparisonTonnes={comparisonTonnes}
            comparisonLabel={comparisonLabel}
            salesRows={salesRows}
            mtd={predictive?.mtd_projection ?? null}
            targetTonnes={currentMonthTarget?.target_tonnes ?? DEFAULT_TARGET_TONNES}
            loading={loading}
            predictiveLoading={predictiveLoading}
            dateFrom={dateFrom}
            dateTo={dateTo}
            comparisonMode={comparisonMode}
            todayTonnes={todayTonnes}
            mtdTonnes={mtdTonnes}
            lyMtdTonnes={lyMtdTonnes}
            lyTodayTonnes={lyTodayTonnes}
            daysInMtd={daysInMtd}
            daysInMonth={daysInMonth}
          />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
          )}

          {/* ── Performance Trends ── */}
          <div className="space-y-3">
            <div className="pb-1 border-b border-border/60">
              <h2 className="text-[13px] font-semibold text-foreground">Performance Trends</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Track performance and momentum over time</p>
            </div>

            {/* Row 1: Daily Comparison + Cumulative YTD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* Daily Comparison — has its own period filter, independent of header date range */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      {chartPeriod === "QTD" ? "QTD Monthly Comparison (Tonnes)" : chartPeriod === "MTD" ? "MTD Daily Performance" : `${chartPeriod} Daily Comparison (Tonnes)`}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      {chartPeriod === "MTD" ? (
                        <>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="inline-block w-3 h-2.5 rounded-sm bg-blue-400 opacity-80" />
                            {" "}Daily tonnes
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="inline-block w-3 h-[2px] rounded bg-violet-400" />
                            {" "}Cumulative MTD
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {chartPeriod === "QTD"
                              ? <span className="inline-block w-3 h-2.5 rounded-sm bg-blue-400 opacity-80" />
                              : <span className="inline-block w-3 h-[2px] rounded bg-blue-400" />}
                            {" "}This Year ({chartThisYearLabel})
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {chartPeriod === "QTD"
                              ? <span className="inline-block w-3 h-2.5 rounded-sm bg-muted-foreground/40" />
                              : <span className="inline-block w-3 border-t border-dashed border-muted-foreground" />}
                            {" "}Last Year ({chartLastYearLabel})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <DropdownBadge
                    value={chartPeriod}
                    options={[{ value: "MTD" }, { value: "QTD" }, { value: "YTD" }]}
                    onChange={(v) => setChartPeriod(v as "MTD" | "QTD" | "YTD")}
                  />
                </div>
                <div className="h-[220px]">
                  {chartDailyLoading ? loadingOverlay : chartPeriod === "QTD" ? (
                    chartQtdBarOptions ? (
                      <ReactECharts option={chartQtdBarOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/50 text-xs">No data for this quarter</div>
                    )
                  ) : chartPeriod === "MTD" ? (
                    chartMtdOptions ? (
                      <ReactECharts option={chartMtdOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/50 text-xs">No data for this month</div>
                    )
                  ) : chartDailyComparisonOptions ? (
                    <ReactECharts option={chartDailyComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/50 text-xs">No daily data for this range</div>
                  )}
                </div>
                {chartPeriod === "MTD" ? (
                  <>
                    <div className="mt-3 pt-3 border-t border-border/40 rounded-lg border border-border/60 bg-muted/5 p-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
                      {(() => {
                        const t = new Date();
                        const MS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        const mS = MS[t.getMonth()];
                        const dd = String(t.getDate()).padStart(2, "0");
                        const yr = t.getFullYear();
                        const lyYr = yr - 1;
                        const gap = mtdTonnes - lyMtdTonnes;
                        const growthPct = lyMtdTonnes > 0 ? ((mtdTonnes - lyMtdTonnes) / lyMtdTonnes) * 100 : null;
                        return (
                          <>
                            <div className="flex flex-col">
                              <div className="text-[9.5px] text-muted-foreground/60 font-medium">Today</div>
                              <div className="text-[14px] font-bold text-foreground mt-0.5">{numberFormatter.format(Math.round(todayTonnes * 100) / 100)} t</div>
                            </div>
                            <div className="flex flex-col">
                              <div className="text-[9.5px] text-muted-foreground/60 font-medium">MTD Total (01 {mS} – {dd} {mS})</div>
                              <div className="text-[14px] font-bold text-foreground mt-0.5">{numberFormatter.format(Math.round(mtdTonnes * 100) / 100)} t</div>
                            </div>
                            <div className="flex flex-col">
                              <div className="text-[9.5px] text-muted-foreground/60 font-medium">LY MTD (01 {mS} – {dd} {mS} {lyYr})</div>
                              <div className="text-[14px] font-bold text-muted-foreground mt-0.5">{numberFormatter.format(Math.round(lyMtdTonnes * 100) / 100)} t</div>
                            </div>
                            <div className="flex flex-col">
                              <div className="text-[9.5px] text-muted-foreground/60 font-medium">MTD Gap</div>
                              <div className={`text-[14px] font-bold mt-0.5 ${gap >= 0 ? "text-emerald-400" : "text-red-400"}`}>{gap >= 0 ? "+" : ""}{numberFormatter.format(Math.round(gap * 100) / 100)} t</div>
                            </div>
                            <div className="flex flex-col">
                              <div className="text-[9.5px] text-muted-foreground/60 font-medium">MTD Growth</div>
                              {growthPct !== null
                                ? <div className={`text-[14px] font-bold mt-0.5 ${growthPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%</div>
                                : <div className="text-[14px] font-bold mt-0.5 text-muted-foreground">—</div>
                              }
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    {(() => {
                      const t = new Date();
                      const MS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                      const dIM = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
                      return (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-[10.5px] text-muted-foreground/70 flex items-start gap-1.5">
                          <span className="text-primary/60 flex-shrink-0 font-bold mt-px">ⓘ</span>
                          <span>MTD includes sales from the start of the month to the selected end date ({String(t.getDate()).padStart(2, "0")} {MS[t.getMonth()]} {t.getFullYear()}). Targets are prorated for the same period ({t.getDate()} of {dIM} days).</span>
                        </div>
                      );
                    })()}
                  </>
                ) : (chartPeriod === "QTD" ? chartQtdBarOptions : chartDailyComparisonOptions) && (() => {
                  const _opts = chartPeriod === "QTD" ? chartQtdBarOptions : chartDailyComparisonOptions;
                  const curEnd = (_opts as any)._curEnd ?? 0;
                  const compEnd = (_opts as any)._compEnd ?? 0;
                  const diffPct = (_opts as any)._diffPct;
                  const diff = curEnd - compEnd;
                  return (
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between gap-4 text-[12px]">
                      {diffPct !== null ? (
                        <span className="flex items-center gap-1.5">
                          <span className={`font-bold ${diffPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {diffPct >= 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}%
                          </span>
                          <span className="text-muted-foreground">more than last year (same period)</span>
                        </span>
                      ) : <span />}
                      {diff !== 0 && (
                        <span className={`font-semibold ${diffPct != null && diffPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {diff >= 0 ? "+" : ""}{numberFormatter.format(diff)} t
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Cumulative YTD Sales Comparison */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">Cumulative YTD Sales Comparison</h3>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-3 h-[2px] rounded bg-blue-400" /> This Year ({currentYear})
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-3 h-[2px] rounded bg-muted-foreground" /> Last Year ({previousYear})
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-3 border-t border-dashed border-amber-400" /> Target ({currentYear})
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-3 border-t border-dashed border-sky-400" /> YTD Average ({currentYear})
                      </span>
                    </div>
                  </div>
                  <DropdownBadge
                    value={cumulView}
                    options={[{ value: "Cumulative" }, { value: "Monthly" }]}
                    onChange={(v) => setCumulView(v as "Cumulative" | "Monthly")}
                  />
                </div>
                <div className="h-[220px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={cumulView === "Monthly" ? monthlyComparisonOptions : cumulativeComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                {cumulativeFooter && (
                  <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-4 gap-2 text-[12px]">
                    <div>
                      <div className="text-[10px] text-muted-foreground/60">YTD (as of today)</div>
                      <div className="font-bold text-foreground mt-0.5">{numberFormatter.format(cumulativeFooter.ytd)} t</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground/60">LY YTD (same day)</div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="font-bold text-foreground">{numberFormatter.format(cumulativeFooter.lyYTD)} t</span>
                        {cumulativeFooter.vsLYPct != null && (
                          <span className={`text-[10px] font-bold ${cumulativeFooter.vsLYPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {cumulativeFooter.vsLYPct >= 0 ? "▲" : "▼"} {Math.abs(cumulativeFooter.vsLYPct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground/60">Gap to LY YTD</div>
                      <div className={`font-bold mt-0.5 ${cumulativeFooter.gapToLY >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {cumulativeFooter.gapToLY >= 0 ? "+" : ""}{numberFormatter.format(cumulativeFooter.gapToLY)} t
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground/60">Gap to Target YTD</div>
                      <div className={`font-bold mt-0.5 ${cumulativeFooter.gapToTarget >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {cumulativeFooter.gapToTarget >= 0 ? "+" : ""}{numberFormatter.format(cumulativeFooter.gapToTarget)} t
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Monthly Growth YoY | Quarter by Quarter | Product Group Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

              {/* Monthly Growth YoY */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      {growthView === "Volume" ? "Monthly Volume Comparison" : "Monthly Growth (YoY)"}
                    </h3>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {growthView === "Volume" ? "Current year vs same period last year" : "YoY % change by month"}
                    </p>
                  </div>
                  <DropdownBadge
                    value={growthView}
                    options={[{ value: "YoY %" }, { value: "Volume" }]}
                    onChange={(v) => setGrowthView(v as "YoY %" | "Volume")}
                  />
                </div>
                <div className="h-[190px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={growthView === "Volume" ? (growthVolumeOptions ?? growthOptions) : growthOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                {growthFooter && (
                  <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    <div>
                      <span className="text-muted-foreground/60">MTD Growth (YoY)</span>
                      <span className={`ml-1.5 font-bold ${growthFooter.mtdGrowth >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {growthFooter.mtdGrowth.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60">Avg Growth YTD</span>
                      <span className={`ml-1.5 font-bold ${growthFooter.avgGrowth >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {growthFooter.avgGrowth.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60">Best Month</span>
                      <span className="ml-1.5 font-semibold text-emerald-400">
                        {growthFooter.bestMonth} (+{growthFooter.bestPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60">Weakest Month</span>
                      <span className={`ml-1.5 font-semibold ${growthFooter.worstPct < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {growthFooter.worstMonth} ({growthFooter.worstPct >= 0 ? "+" : ""}{growthFooter.worstPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quarter by Quarter Comparison */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      {quarterlyView === "Half Year" ? "Half-Year Comparison (Tonnes)" : "Quarter-by-Quarter Comparison (Tonnes)"}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-3 h-[2px] rounded bg-blue-400" /> This Year ({currentYear})
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-3 h-[2px] rounded bg-muted-foreground" /> Last Year ({previousYear})
                      </span>
                    </div>
                  </div>
                  <DropdownBadge
                    value={quarterlyView}
                    options={[{ value: "Quarterly" }, { value: "Half Year" }]}
                    onChange={(v) => setQuarterlyView(v as "Quarterly" | "Half Year")}
                  />
                </div>
                <div className="h-[190px]">
                  {momLoading ? loadingOverlay : (quarterlyView === "Half Year" ? halfYearChartOptions : quarterlyChartOptions) ? (
                    <ReactECharts option={(quarterlyView === "Half Year" ? halfYearChartOptions : quarterlyChartOptions)!} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/50 text-xs">No data</div>
                  )}
                </div>
                {(quarterlyView === "Half Year" ? halfYearData.length > 0 : quarterlyData.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-1">
                    <div className="flex gap-1.5 flex-wrap">
                      {quarterlyView === "Half Year"
                        ? halfYearData.filter(h => h.previous > 0).map(h => (
                            <span key={h.h} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              h.pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            }`}>
                              {h.h.split(" ")[0]}: {h.pct >= 0 ? "+" : ""}{h.pct.toFixed(1)}%
                            </span>
                          ))
                        : quarterlyData.filter(q => q.previous > 0).map(q => (
                            <span key={q.q} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              q.pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            }`}>
                              {q.q}: {q.pct >= 0 ? "+" : ""}{q.pct.toFixed(1)}%
                            </span>
                          ))
                      }
                    </div>
                    <span className="text-[9px] text-primary/60 hover:text-primary cursor-pointer transition-colors">View full quarterly report →</span>
                  </div>
                )}
              </div>

              {/* Product Group Trends */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">Product Group Trends (YTD)</h3>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">vs same period last year</p>
                  </div>
                  <DropdownBadge
                    value={productSort}
                    options={[{ value: "By Growth" }, { value: "By Volume" }]}
                    onChange={(v) => setProductSort(v as "By Growth" | "By Volume")}
                  />
                </div>
                {predictiveLoading ? loadingOverlay : allProductGroups.length === 0 ? (
                  <div className="flex h-[190px] items-center justify-center text-muted-foreground/50 text-xs">No data</div>
                ) : (
                  <div className="h-[190px] overflow-y-auto">
                    <table className="w-full text-[10.5px]">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border/50">
                          <th className="text-left font-semibold text-muted-foreground/60 py-1.5 pr-2">Product Group</th>
                          <th className="text-right font-semibold text-muted-foreground/60 py-1.5 px-1">This YTD</th>
                          <th className="text-right font-semibold text-muted-foreground/60 py-1.5 px-1">LY YTD</th>
                          <th className="text-right font-semibold text-muted-foreground/60 py-1.5 px-1">Gap</th>
                          <th className="text-right font-semibold text-muted-foreground/60 py-1.5 pl-1">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...allProductGroups]
                          .sort((a, b) => productSort === "By Volume"
                            ? b.current_3m_tonnes - a.current_3m_tonnes
                            : Math.abs(b.pct_change ?? 0) - Math.abs(a.pct_change ?? 0))
                          .slice(0, 8)
                          .map((g, i) => {
                            const pct = g.pct_change ?? 0;
                            return (
                              <tr key={i} className="border-b border-border/25 last:border-0 hover:bg-white/3 transition-colors">
                                <td className="py-1.5 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    {trendIcon(g.trend)}
                                    <span className="text-foreground font-medium truncate max-w-[90px]" title={g.name || g.code}>
                                      {g.name || g.code}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-right py-1.5 px-1 text-muted-foreground whitespace-nowrap">
                                  {numberFormatter.format(g.current_3m_tonnes)} t
                                </td>
                                <td className="text-right py-1.5 px-1 text-muted-foreground whitespace-nowrap">
                                  {numberFormatter.format(g.prior_3m_tonnes)} t
                                </td>
                                <td className="text-right py-1.5 px-1 whitespace-nowrap">
                                  {(() => {
                                    const gap = g.current_3m_tonnes - g.prior_3m_tonnes;
                                    return (
                                      <span className={`font-semibold ${gap >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {gap >= 0 ? "+" : ""}{numberFormatter.format(gap)} t
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="text-right py-1.5 pl-1">
                                  <span className={`font-semibold ${trendColor(g.trend)}`}>
                                    {pct > 0 ? "▲ " : pct < 0 ? "▼ " : ""}{Math.abs(pct).toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
                {allProductGroups.length > 8 && (
                  <div className="mt-2 pt-1.5 border-t border-border/30 text-center">
                    <span className="text-[9px] text-primary/60 hover:text-primary cursor-pointer transition-colors">View all product groups →</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Commercial Action Center ── */}
          <CommercialActionCenter
            predictive={predictive}
            loading={predictiveLoading}
            onSelectCustomer={setSelectedRisk}
            comparisonLabel={comparisonLabel}
          />

          {/* ── Insight Bar ── */}
          {insightText && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Idea01Icon size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-semibold text-primary mr-2">Insight</span>
                <span className="text-[12px] text-muted-foreground">{insightText}</span>
              </div>
              <button
                onClick={() => document.dispatchEvent(new Event("open-ai-drawer"))}
                className="flex-shrink-0 flex items-center gap-1 text-[12px] font-medium text-primary hover:opacity-80 transition-opacity whitespace-nowrap"
              >
                View all insights <ArrowRight01Icon size={11} />
              </button>
            </div>
          )}

        </div>
      </div>

      <CustomerDrilldownModal
        open={selectedRisk !== null}
        onClose={() => setSelectedRisk(null)}
        customerCode={selectedRisk?.customer_code ?? ""}
        customerName={selectedRisk?.customer_name ?? null}
        revenueTier={selectedRisk?.revenue_tier ?? "low"}
        tonnes6mPrior={selectedRisk?.tonnes_6m_prior ?? 0}
        lastPurchaseDate={selectedRisk?.last_purchase_date ?? null}
        daysSince={selectedRisk?.days_since_purchase ?? null}
        companyNos={companyNos}
        saleScope={saleScope}
      />
      <AIFloatingDrawer />
    </div>
  );
}
