import { useEffect, useMemo, useState } from "react";
import {
  ChartDownIcon,
  Activity01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  ChartUpIcon,
  ArrowRight01Icon,
  Logout01Icon,
  Alert01Icon,
} from "hugeicons-react";
import ReactECharts from "echarts-for-react";

import {
  getSalesSummary,
  getPredictiveInsights,
  getRefreshFreshness,
  getMovementSummary,
  getDailySales,
  type SalesSummaryResponse,
  type PredictiveInsightsResponse,
  type RefreshFreshness,
  type MovementSummary,
  type DailySalesRow,
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
import { useCompany } from "@/lib/company-context";
import { CustomerDrilldownModal } from "@/components/home/customer-drilldown-modal";

const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const chartColors = ["#818cf8","#34d399","#fb923c","#f87171","#a78bfa","#38bdf8"];
const divisionColors: Record<string, string> = {
  "3": "#818cf8",
  "4": "#34d399",
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

const darkChartBase = {
  backgroundColor: "transparent",
  textStyle: { color: "#8b949e" },
  tooltip: { backgroundColor: "#1c2128", borderColor: "#30363d", textStyle: { color: "#e6edf3" } },
};

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

const loadingOverlay = (
  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
    <div className="flex items-center gap-2">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      Loading…
    </div>
  </div>
);

export default function Home() {
  const { companyNos, saleScope, companyLabel, dateFrom, dateTo, isAllTime } = useCompany();

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
  const [productGroupFilter, setProductGroupFilter] = useState("all");

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
    const handler = () => {
      loadFiltered();
      loadDailySales();
      loadMom();
      loadMovSummary();
      loadFreshness();
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
  }, [momRows, currentYear, previousYear, lastCurrentYearMonth]);

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

  const cumulativeChips = useMemo(() => {
    if (!momRows.length || !currentYear || !previousYear) return null;
    const curYTD = momRows.filter(r => r.year === currentYear && r.month <= lastCurrentYearMonth).reduce((s, r) => s + r.total_tonnes, 0);
    const prevYTD = momRows.filter(r => r.year === previousYear && r.month <= lastCurrentYearMonth).reduce((s, r) => s + r.total_tonnes, 0);
    const vsLYPct = prevYTD > 0 ? ((curYTD - prevYTD) / prevYTD) * 100 : null;
    const gapToLY = prevYTD - curYTD;
    return { curYTD, vsLYPct, gapToLY };
  }, [momRows, currentYear, previousYear, lastCurrentYearMonth]);

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
  const productGroupOptions = useMemo(() => {
    const names = Array.from(new Set(allProductGroups.map(g => g.name || g.code).filter(Boolean)));
    return names.sort();
  }, [allProductGroups]);
  const filteredProductGroups = useMemo(() => {
    if (productGroupFilter === "all") return allProductGroups;
    return allProductGroups.filter(g => (g.name || g.code) === productGroupFilter);
  }, [allProductGroups, productGroupFilter]);

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
      ...darkChartBase,
      tooltip: {
        ...darkChartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: {
        data: ["This Year", "Last Year"],
        top: "2%",
        textStyle: { color: "#8b949e", fontSize: 10 },
      },
      grid: { left: "8%", right: "5%", bottom: "12%", top: "18%" },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: "#8b949e", fontSize: 9,
          interval: Math.max(1, Math.floor(totalDays / 8) - 1) },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Cumul. t",
        nameTextStyle: { color: "#8b949e", fontSize: 9 },
        axisLabel: { color: "#8b949e", fontSize: 9 },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: "This Year",
          type: "line",
          data: curData,
          connectNulls: false,
          smooth: false,
          lineStyle: { width: 2, color: "#34d399" },
          itemStyle: { color: "#34d399" },
          showSymbol: false,
          symbol: "circle",
          symbolSize: 5,
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: "#34d39930" }, { offset: 1, color: "transparent" }],
            },
          },
          endLabel: {
            show: true,
            fontSize: 9,
            color: "#34d399",
            // @ts-ignore
            formatter: (p: any) => p.value != null ? `${numberFormatter.format(p.value)} t` : "",
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
          endLabel: {
            show: true,
            fontSize: 9,
            color: "#6b7280",
            // @ts-ignore
            formatter: (p: any) => p.value != null ? `${numberFormatter.format(p.value)} t` : "",
          },
        },
      ],
      _curEnd: curEnd,
      _compEnd: compEnd,
      _diffPct: diffPct,
    };
  }, [dailySales, compDailySales, dateFrom, dateTo, comparisonMode]);

  // ── Monthly comparison chart ───────────────────────────────────────────────
  const monthlyComparisonOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: {
      ...darkChartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) => params
        // @ts-ignore
        .filter(item => item.value != null)
        // @ts-ignore
        .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
        .join("<br />"),
    },
    legend: { data: momYears.map(y => String(y)), top: "4%", textStyle: { color: "#8b949e" } },
    grid: { left: "8%", right: "4%", bottom: "14%", top: "18%" },
    xAxis: {
      type: "category",
      data: monthlyComparisonData.map(d => d.month),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e" },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: "Tonnes",
      nameTextStyle: { color: "#8b949e" },
      axisLabel: { color: "#8b949e" },
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
    ...darkChartBase,
    tooltip: {
      ...darkChartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) => params
        // @ts-ignore
        .filter(item => item.value != null)
        // @ts-ignore
        .map(item => item.seriesName === "Growth %"
          ? `${item.seriesName}: ${Number(item.value).toFixed(2)}%`
          : `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
        .join("<br />"),
    },
    legend: { data: ["Current year (t)", "Growth %"], top: "4%", textStyle: { color: "#8b949e" } },
    grid: { left: "10%", right: "12%", bottom: "14%", top: "22%" },
    xAxis: {
      type: "category",
      data: growthData.map(d => d.month),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e", fontSize: 9 },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "Tonnes",
        nameTextStyle: { color: "#8b949e", fontSize: 9 },
        axisLabel: { color: "#8b949e", fontSize: 9 },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      {
        type: "value",
        name: "Growth %",
        position: "right",
        nameTextStyle: { color: "#8b949e", fontSize: 9 },
        axisLabel: { color: "#8b949e", fontSize: 9, formatter: "{value}%" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Current year (t)",
        type: "bar",
        data: growthData.map((d, idx) => idx + 1 <= lastCurrentYearMonth ? d.current : null),
        itemStyle: { color: "#818cf8", borderRadius: [3, 3, 0, 0] },
        label: {
          show: true,
          position: "top",
          fontSize: 8,
          color: "#8b949e",
          // @ts-ignore
          formatter: (p: any) => p.value != null && p.value > 0 ? `${(p.value / 1000).toFixed(1)}k` : "",
        },
      },
      {
        name: "Growth %",
        type: "line",
        yAxisIndex: 1,
        data: growthData.map((d, idx) => idx + 1 <= lastCurrentYearMonth && d.current > 0 ? Number(d.growth.toFixed(2)) : null),
        connectNulls: false,
        smooth: false,
        lineStyle: { width: 2, color: "#f87171" },
        itemStyle: { color: "#f87171" },
        symbol: "circle",
        symbolSize: 5,
        showSymbol: true,
        label: {
          show: true,
          position: "top",
          fontSize: 8,
          color: "#f87171",
          // @ts-ignore
          formatter: (p: any) => p.value != null ? `${Number(p.value).toFixed(0)}%` : "",
        },
      },
    ],
  }), [growthData, lastCurrentYearMonth]);

  const cumulativeComparisonOptions = useMemo(() => {
    const annualTarget = DEFAULT_TARGET_TONNES * 12;
    const targetData = Array.from({ length: 12 }, (_, i) => (i + 1) * (annualTarget / 12));
    const baseSeries = momYears.map((year, index) => ({
      name: String(year),
      type: "line",
      data: cumulativeComparisonData.map((d, idx) => {
        if (year === currentYear && idx + 1 > lastCurrentYearMonth) return null;
        const v = d[`year${year}`];
        return v != null ? v : null;
      }),
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2, color: chartColors[index % chartColors.length] },
      itemStyle: { color: chartColors[index % chartColors.length] },
      showSymbol: false,
      endLabel: {
        show: true,
        fontSize: 9,
        color: chartColors[index % chartColors.length],
        // @ts-ignore
        formatter: (p: any) => p.value != null && p.value > 0 ? `${numberFormatter.format(p.value)} t` : "",
      },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${chartColors[index % chartColors.length]}20` },
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
    }));
    const targetSeries = {
      name: `Target ${currentYear ?? ""}`,
      type: "line",
      data: targetData,
      lineStyle: { type: "dashed", color: "#6b7280", width: 1.5 },
      itemStyle: { color: "#6b7280" },
      showSymbol: false,
      endLabel: {
        show: true,
        fontSize: 9,
        color: "#6b7280",
        // @ts-ignore
        formatter: (p: any) => p.value != null ? `Target: ${numberFormatter.format(p.value)} t` : "",
      },
    };
    return {
      ...darkChartBase,
      tooltip: {
        ...darkChartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: {
        data: [...momYears.map(y => String(y)), `Target ${currentYear ?? ""}`],
        top: "4%",
        textStyle: { color: "#8b949e" },
      },
      grid: { left: "8%", right: "12%", bottom: "12%", top: "18%" },
      xAxis: {
        type: "category",
        data: cumulativeComparisonData.map(d => d.month),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: "#8b949e" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Tonnes",
        nameTextStyle: { color: "#8b949e" },
        axisLabel: { color: "#8b949e" },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [...baseSeries, targetSeries],
    };
  }, [cumulativeComparisonData, momYears, currentYear, lastCurrentYearMonth]);

  const quarterlyChartOptions = useMemo(() => {
    if (!quarterlyData.length) return null;
    return {
      ...darkChartBase,
      tooltip: {
        ...darkChartBase.tooltip,
        trigger: "axis",
        // @ts-ignore
        formatter: (params) => params
          // @ts-ignore
          .filter(item => item.value != null && item.value > 0)
          // @ts-ignore
          .map(item => `${item.seriesName}: ${numberFormatter.format(item.value)} t`)
          .join("<br />"),
      },
      legend: {
        data: [String(currentYear ?? "Current"), String(previousYear ?? "Prior")],
        top: "2%",
        textStyle: { color: "#8b949e", fontSize: 10 },
      },
      grid: { left: "10%", right: "4%", bottom: "14%", top: "22%" },
      xAxis: {
        type: "category",
        data: quarterlyData.map(d => d.q),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: "#8b949e" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Tonnes",
        nameTextStyle: { color: "#8b949e", fontSize: 9 },
        axisLabel: { color: "#8b949e", fontSize: 9 },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [
        {
          name: String(currentYear ?? "Current"),
          type: "bar",
          data: quarterlyData.map(d => d.current > 0 ? d.current : null),
          itemStyle: { color: "#818cf8", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            color: "#8b949e",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? `${(p.value / 1000).toFixed(1)}k` : "",
          },
        },
        {
          name: String(previousYear ?? "Prior"),
          type: "bar",
          data: quarterlyData.map(d => d.previous),
          itemStyle: { color: "#30363d", borderRadius: [3, 3, 0, 0] },
          barGap: "15%",
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            color: "#6b7280",
            // @ts-ignore
            formatter: (p: any) => p.value > 0 ? `${(p.value / 1000).toFixed(1)}k` : "",
          },
        },
      ],
    };
  }, [quarterlyData, currentYear, previousYear]);

  const divisionChartOptions = useMemo(() => {
    if (!divisionBreakdown.length) return null;
    const total = divisionBreakdown.reduce((s, d) => s + d.total_tonnes, 0);
    return {
      ...darkChartBase,
      tooltip: {
        ...darkChartBase.tooltip,
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
          itemStyle: { color: divisionColors[d.company_no] ?? "#818cf8" },
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

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 md:p-5 space-y-4">

          {/* ── Page Header ── */}
          <div className="flex items-start justify-between gap-3 pb-2 border-b border-border">
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">Commercial Overview</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Real-time performance · {companyLabel}
                {!isAllTime && dateFrom && dateTo && (
                  <span className="ml-1 text-muted-foreground/60">
                    · {formatDateLabel(dateFrom)} – {formatDateLabel(dateTo)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <DataFreshnessIndicator freshness={freshness} />
            </div>
          </div>

          {/* ── Filter / Comparison Bar ── */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-end gap-2">
              {/* Date View (comparison mode) */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55">Date View</span>
                <select
                  value={comparisonMode}
                  onChange={e => setComparisonMode(e.target.value as ComparisonMode)}
                  className="h-7 px-2 text-[11px] rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="same_period_ly">Same Period LY</option>
                  <option value="previous_period">Previous Period</option>
                </select>
              </div>

              {/* Scope (read-only display from TopBar) */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55">Scope</span>
                <div className="h-7 px-2.5 flex items-center text-[11px] rounded-md border border-border bg-secondary text-muted-foreground capitalize min-w-[80px]">
                  {saleScope === "all" ? "All Sales" : saleScope}
                </div>
              </div>

              {/* Division */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55">Division</span>
                <div className="h-7 px-2.5 flex items-center text-[11px] rounded-md border border-border bg-secondary text-muted-foreground max-w-[160px] truncate">
                  {companyLabel}
                </div>
              </div>

              {/* Product Group filter */}
              {productGroupOptions.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55">Product Group</span>
                  <select
                    value={productGroupFilter}
                    onChange={e => setProductGroupFilter(e.target.value)}
                    className="h-7 px-2 text-[11px] rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer max-w-[160px]"
                  >
                    <option value="all">All Groups</option>
                    {productGroupOptions.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Period display */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/55">Period</span>
                <div className="h-7 px-2.5 flex items-center text-[11px] rounded-md border border-border bg-secondary text-muted-foreground whitespace-nowrap">
                  {isAllTime ? "All time" : `${formatDateLabel(dateFrom)} – ${formatDateLabel(dateTo)}`}
                </div>
              </div>

              {/* Clear filters (only shown if non-defaults) */}
              {(comparisonMode !== "same_period_ly" || productGroupFilter !== "all") && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-widest font-semibold text-transparent select-none">·</span>
                  <button
                    onClick={() => { setComparisonMode("same_period_ly"); setProductGroupFilter("all"); }}
                    className="h-7 px-2.5 flex items-center gap-1.5 text-[11px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  >
                    <Logout01Icon size={11} />
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            {/* Comparison banner */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/15 bg-primary/5 text-[11px]">
              <span className="text-primary font-bold text-sm flex-shrink-0 leading-none">ℹ</span>
              <span className="text-muted-foreground">
                All comparisons are for the same equivalent period:{" "}
                <span className="text-foreground font-medium">
                  {getComparisonBannerText(dateFrom, dateTo, comparisonMode)}
                </span>
              </span>
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <DashboardKpiGrid
            totalTonnes={totalTonnes}
            comparisonTonnes={comparisonTonnes}
            comparisonLabel={comparisonLabel}
            salesRows={salesRows}
            mtd={predictive?.mtd_projection ?? null}
            atRiskCustomers={predictive?.customer_lapse_risk.length ?? 0}
            activeCustomers={movementSummary?.active_customers ?? 0}
            criticalCustomers={criticalCustomers}
            loading={loading}
            predictiveLoading={predictiveLoading}
            dateFrom={dateFrom}
            dateTo={dateTo}
            comparisonMode={comparisonMode}
          />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
          )}

          {/* ── Commercial Action Center ── */}
          <CommercialActionCenter
            predictive={predictive}
            loading={predictiveLoading}
            onSelectCustomer={setSelectedRisk}
            comparisonLabel={comparisonLabel}
          />

          {/* ── Performance Trends ── */}
          <div className="space-y-3">
            <div className="pb-1 border-b border-border/60">
              <h2 className="text-[13px] font-semibold text-foreground">Performance Trends</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Track momentum and growth patterns over time</p>
            </div>

            {/* Row 1: Daily comparison (if short range) + Cumulative YTD */}
            <div className={`grid gap-3 ${showDailyChart ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>

              {/* MTD Daily Comparison */}
              {showDailyChart && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-foreground">Daily Comparison</h3>
                    <span className="text-[9px] text-muted-foreground/50">Cumulative tonnes</span>
                  </div>
                  {dailyComparisonOptions && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(() => {
                        const curEnd = (dailyComparisonOptions as any)._curEnd ?? 0;
                        const compEnd = (dailyComparisonOptions as any)._compEnd ?? 0;
                        const diffPct = (dailyComparisonOptions as any)._diffPct;
                        return (
                          <>
                            {diffPct !== null && (
                              <InsightChip
                                label={`${diffPct >= 0 ? "▲" : "▼"} ${Math.abs(diffPct).toFixed(1)}% vs ${comparisonLabel}`}
                                variant={diffPct >= 0 ? "green" : "red"}
                              />
                            )}
                            {curEnd > 0 && <InsightChip label={`This period: ${numberFormatter.format(curEnd)} t`} variant="blue" />}
                            {compEnd > 0 && <InsightChip label={`Prior: ${numberFormatter.format(compEnd)} t`} variant="neutral" />}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="h-[240px]">
                    {dailyLoading ? loadingOverlay : dailyComparisonOptions ? (
                      <ReactECharts option={dailyComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/50 text-xs">No daily data</div>
                    )}
                  </div>
                  <p className="mt-1.5 text-[9px] text-muted-foreground/50">Cumulative daily totals · All values in tonnes</p>
                </div>
              )}

              {/* Cumulative YTD Sales Comparison */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Cumulative YTD Comparison</h3>
                  {cumulativeChips && (
                    <div className="flex flex-wrap gap-1.5">
                      <InsightChip label={`YTD: ${numberFormatter.format(cumulativeChips.curYTD)} t`} variant="blue" />
                      {cumulativeChips.vsLYPct != null && (
                        <InsightChip
                          label={`${cumulativeChips.vsLYPct >= 0 ? "↑" : "↓"} ${Math.abs(cumulativeChips.vsLYPct).toFixed(0)}% vs ${previousYear}`}
                          variant={cumulativeChips.vsLYPct >= 0 ? "green" : "red"}
                        />
                      )}
                      {cumulativeChips.gapToLY > 0 && (
                        <InsightChip label={`Gap to LY: ${numberFormatter.format(cumulativeChips.gapToLY)} t`} variant="amber" />
                      )}
                    </div>
                  )}
                </div>
                <div className="h-[240px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={cumulativeComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground/50">All values in tonnes</p>
              </div>
            </div>

            {/* Row 2: Monthly MoM comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Month-on-Month Comparison</h3>
                </div>
                {momChips && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {momChips.ytdPct != null && (
                      <InsightChip
                        label={`${currentYear} vs ${previousYear}: ${momChips.ytdPct >= 0 ? "+" : ""}${momChips.ytdPct.toFixed(0)}%`}
                        variant={momChips.ytdPct >= 0 ? "green" : "red"}
                      />
                    )}
                    {momChips.peakMonth && <InsightChip label={`↑ Peak: ${momChips.peakMonth}`} variant="green" />}
                    {momChips.dropMonth && <InsightChip label={`↓ Weakest: ${momChips.dropMonth}`} variant="red" />}
                  </div>
                )}
                <div className="h-[240px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={monthlyComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground/50">Actuals · - - - Not yet available · All values in tonnes</p>
              </div>

              {/* Monthly Growth */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Monthly Growth (YoY)</h3>
                </div>
                {growthChips && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {growthChips.bestMonth && <InsightChip label={`↑ Best: ${growthChips.bestMonth}`} variant="green" />}
                    {growthChips.avg > 0 && <InsightChip label={`Avg: ${numberFormatter.format(growthChips.avg)} t`} variant="blue" />}
                    <InsightChip
                      label={`Trend: ${growthChips.trend}`}
                      variant={growthChips.trend === "Growing" ? "green" : growthChips.trend === "Declining" ? "red" : "neutral"}
                    />
                  </div>
                )}
                <div className="h-[240px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={growthOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground/50">Growth % vs prior year · All values in tonnes</p>
              </div>
            </div>

            {/* Row 3: Quarterly + Product Group Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* Quarter by Quarter */}
              {quarterlyChartOptions && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-foreground">
                      Quarter by Quarter ({currentYear} vs {previousYear})
                    </h3>
                    <span className="text-[9px] text-muted-foreground/60">Tonnes</span>
                  </div>
                  <div className="h-[200px]">
                    {momLoading ? loadingOverlay : (
                      <ReactECharts option={quarterlyChartOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                    )}
                  </div>
                  {quarterlyData.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {quarterlyData.filter(q => q.previous > 0).map(q => (
                        <span key={q.q} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          q.pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        }`}>
                          {q.q}: {q.pct >= 0 ? "+" : ""}{q.pct.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Product Group Trends Table */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Product Group Trends</h3>
                  <span className="text-[9px] text-muted-foreground/60">3-month rolling</span>
                </div>
                {predictiveLoading ? loadingOverlay : filteredProductGroups.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center text-muted-foreground/50 text-xs">No data</div>
                ) : (
                  <div className="h-[200px] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border/50">
                          <th className="text-left font-semibold text-muted-foreground/70 py-1.5 pr-2">Group</th>
                          <th className="text-right font-semibold text-muted-foreground/70 py-1.5 px-2">This 3M</th>
                          <th className="text-right font-semibold text-muted-foreground/70 py-1.5 px-2">Prior 3M</th>
                          <th className="text-right font-semibold text-muted-foreground/70 py-1.5 pl-2">Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProductGroups
                          .sort((a, b) => Math.abs(b.pct_change ?? 0) - Math.abs(a.pct_change ?? 0))
                          .map((g, i) => {
                            const pct = g.pct_change ?? 0;
                            return (
                              <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-white/3 transition-colors">
                                <td className="py-1.5 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    {trendIcon(g.trend)}
                                    <span className="text-foreground font-medium truncate max-w-[100px]" title={g.name || g.code}>
                                      {g.name || g.code}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-right py-1.5 px-2 text-muted-foreground">
                                  {numberFormatter.format(g.current_3m_tonnes)} t
                                </td>
                                <td className="text-right py-1.5 px-2 text-muted-foreground">
                                  {numberFormatter.format(g.prior_3m_tonnes)} t
                                </td>
                                <td className="text-right py-1.5 pl-2">
                                  <span className={`font-semibold ${trendColor(g.trend)}`}>
                                    {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Division Breakdown (when multiple companies selected) */}
            {(companyNos.includes("all") || companyNos.length > 1) && divisionBreakdown.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-foreground">Sales by Division</h3>
                  <span className="text-[9px] text-muted-foreground/60">All values in tonnes</span>
                </div>
                {loading ? loadingOverlay : divisionChartOptions ? (
                  <div className="flex gap-2 h-[220px]">
                    <div className="flex-shrink-0 w-[160px]">
                      <ReactECharts option={divisionChartOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center py-2">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 pb-1.5 mb-1 border-b border-border/50">
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">Division</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 text-right">Tonnes</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 text-right w-10">Share</span>
                      </div>
                      {(() => {
                        const divTotal = divisionBreakdown.reduce((s, x) => s + x.total_tonnes, 0);
                        return divisionBreakdown.map(d => {
                          const share = divTotal > 0 ? (d.total_tonnes / divTotal) * 100 : 0;
                          const color = divisionColors[d.company_no] ?? "#818cf8";
                          return (
                            <div key={d.company_no} className="py-1.5 border-b border-border/40 last:border-0">
                              <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 items-center mb-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                                  <span className="text-[11px] font-medium text-foreground truncate">{d.label}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap text-right">
                                  {numberFormatter.format(d.total_tonnes)} t
                                </span>
                                <span className="text-[10px] font-semibold text-foreground text-right w-10 whitespace-nowrap">
                                  {share.toFixed(1)}%
                                </span>
                              </div>
                              <div className="h-1 rounded-full bg-white/5 overflow-hidden ml-3.5">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${share}%`, background: `${color}cc` }} />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">No data</div>
                )}
              </div>
            )}

          </div>

          {/* ── Insight Bar ── */}
          {insightText && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
              <div className="flex-shrink-0 h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center mt-0.5">
                <Alert01Icon size={13} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold text-primary uppercase tracking-widest mr-2">Insight</span>
                <span className="text-[11px] text-muted-foreground">{insightText}</span>
              </div>
              <button
                onClick={() => document.dispatchEvent(new Event("open-ai-drawer"))}
                className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
              >
                Ask AI <ArrowRight01Icon size={11} />
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
