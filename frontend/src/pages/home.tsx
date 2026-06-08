import { useEffect, useMemo, useState } from "react";
import {
  Alert01Icon,
  ChartDownIcon,
  Activity01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  ChartUpIcon,
  ArrowRight01Icon,
} from "hugeicons-react";
import ReactECharts from "echarts-for-react";

import {
  getSalesSummary,
  getPredictiveInsights,
  getRefreshFreshness,
  getMovementSummary,
  type SalesSummaryResponse,
  type PredictiveInsightsResponse,
  type RefreshFreshness,
  type MovementSummary,
} from "@/lib/api";
import DashboardKpiGrid, { DEFAULT_TARGET_TONNES } from "@/components/home/dashboard-kpi-grid";
import CommercialActionCenter from "@/components/home/commercial-action-center";
import AIFloatingDrawer from "@/components/ai/ai-floating-drawer";
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

function formatTonnes(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${numberFormatter.format(value)} t`;
}

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

function ProdGroupSparkline({ prior, current, color }: { prior: number; current: number; color: string }) {
  const w = 44, h = 20;
  const max = Math.max(prior, current, 0.01);
  const p1 = { x: 3, y: (h - 3) - ((prior / max) * (h - 6)) };
  const p2 = { x: w - 3, y: (h - 3) - ((current / max) * (h - 6)) };
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={p1.x} cy={p1.y} r="1.5" fill={color} opacity="0.5" />
      <circle cx={p2.x} cy={p2.y} r="2" fill={color} />
    </svg>
  );
}

function DataFreshnessIndicator({ freshness }: { freshness: RefreshFreshness | null }) {
  if (!freshness) return null;

  const { status, last_refresh, hours_ago } = freshness;

  let label = "Unknown";
  let dotClass = "bg-muted-foreground/40";
  let textClass = "text-muted-foreground";

  if (status === "ok") {
    dotClass = "bg-emerald-400";
    textClass = "text-emerald-400";
    label = "Up to date";
  } else if (status === "stale") {
    dotClass = "bg-yellow-400";
    textClass = "text-yellow-400";
    label = hours_ago != null ? `${Math.round(hours_ago)}h old` : "Stale";
  } else if (status === "overdue") {
    dotClass = "bg-red-400";
    textClass = "text-red-400";
    label = "Refresh overdue";
  } else if (status === "unknown" || !last_refresh) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <Clock01Icon size={12} />
        No data yet
      </span>
    );
  }

  const d = last_refresh ? new Date(last_refresh) : null;
  const timeStr = d
    ? d.toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  const Icon = status === "ok" ? CheckmarkCircle01Icon : status === "overdue" ? AlertCircleIcon : Clock01Icon;

  return (
    <span
      className={`flex items-center gap-1.5 text-[10px] font-medium ${textClass}`}
      title={`Last refreshed: ${timeStr}`}
    >
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

  const loadFiltered = async () => {
    setLoading(true);
    setPredictiveLoading(true);
    setError(null);
    try {
      const [salesData, predData] = await Promise.all([
        getSalesSummary(dateFrom, dateTo, companyNos, saleScope),
        getPredictiveInsights(companyNos, saleScope),
      ]);
      setSummary(salesData);
      setPredictive(predData);
    } catch (err) {
      setError("Unable to load data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
      setPredictiveLoading(false);
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
  useEffect(() => { loadFiltered(); }, [JSON.stringify(companyNos), saleScope, dateFrom, dateTo]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadMom(); loadMovSummary(); }, [JSON.stringify(companyNos), saleScope]);

  useEffect(() => { loadFreshness(); }, []);

  useEffect(() => {
    const handler = () => {
      loadFiltered();
      loadMom();
      loadMovSummary();
      loadFreshness();
    };
    window.addEventListener("hansa-data-refreshed", handler);
    return () => window.removeEventListener("hansa-data-refreshed", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope, dateFrom, dateTo]);

  const salesRows = summary?.monthly_sales ?? [];
  const momRows = momSummary?.monthly_sales ?? [];

  const momYears = useMemo(
    () => Array.from(new Set(momRows.map((row) => row.year))).sort(),
    [momRows]
  );
  const currentYear = momYears[momYears.length - 1];
  const previousYear = momYears[momYears.length - 2];

  const monthlyComparisonData = useMemo(() => {
    const monthMap = new Map<number, Record<string, number | string>>();
    for (let month = 1; month <= 12; month++) monthMap.set(month, { month: monthLabels[month - 1] });
    momRows.forEach((row) => {
      const record = monthMap.get(row.month);
      if (!record) return;
      record[`year${row.year}`] = row.total_tonnes;
    });
    return Array.from(monthMap.values());
  }, [momRows]);

  const cumulativeComparisonData = useMemo(() => {
    const yearMonthTotals = new Map<number, number[]>();
    momYears.forEach((year) => yearMonthTotals.set(year, Array(12).fill(0)));
    momRows.forEach((row) => {
      const totals = yearMonthTotals.get(row.year);
      if (!totals) return;
      totals[row.month - 1] += row.total_tonnes;
    });
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const point: Record<string, number | string> = { month: monthLabels[index] };
      momYears.forEach((year) => {
        const totals = yearMonthTotals.get(year) ?? [];
        point[`year${year}`] = totals.slice(0, month).reduce((sum, v) => sum + v, 0);
      });
      return point;
    });
  }, [momRows, momYears]);

  const growthData = useMemo(() => {
    if (!currentYear) return [];
    const currentTotals = new Array(12).fill(0);
    const previousTotals = new Array(12).fill(0);
    momRows.forEach((row) => {
      if (row.year === currentYear) currentTotals[row.month - 1] += row.total_tonnes;
      if (row.year === previousYear) previousTotals[row.month - 1] += row.total_tonnes;
    });
    return currentTotals.map((total, index) => {
      const prior = previousTotals[index];
      return { month: monthLabels[index], current: total, growth: prior === 0 ? 0 : ((total - prior) / prior) * 100 };
    });
  }, [currentYear, previousYear, momRows]);

  const totalTonnes = useMemo(() => salesRows.reduce((sum, row) => sum + row.total_tonnes, 0), [salesRows]);

  const lyTonnes = useMemo(() => {
    if (!momRows.length) return 0;
    const dfDate = new Date(dateFrom);
    const dtDate = new Date(dateTo);
    const fromYear = dfDate.getFullYear() - 1;
    const toYear = dtDate.getFullYear() - 1;
    const fromMonth = dfDate.getMonth() + 1;
    const toMonth = dtDate.getMonth() + 1;
    return momRows
      .filter((r) => {
        if (r.year < fromYear || r.year > toYear) return false;
        if (r.year === fromYear && r.month < fromMonth) return false;
        if (r.year === toYear && r.month > toMonth) return false;
        return true;
      })
      .reduce((sum, r) => sum + r.total_tonnes, 0);
  }, [momRows, dateFrom, dateTo]);

  const growingGroups = useMemo(
    () => predictive?.product_group_trends.filter((g) => g.trend === "growing") ?? [],
    [predictive]
  );

  const divisionBreakdown = summary?.division_breakdown ?? [];

  // ── Today / insight computations ──────────────────────────────────────────
  const todayMonth = new Date().getMonth() + 1;

  const lastCurrentYearMonth = useMemo(() => {
    const rows = momRows.filter(r => r.year === currentYear);
    if (!rows.length) return todayMonth;
    return Math.max(...rows.map(r => r.month));
  }, [momRows, currentYear, todayMonth]);

  const momChips = useMemo(() => {
    if (!momRows.length || !currentYear || !previousYear) return null;
    const curTotals = Array(12).fill(0);
    const prevTotals = Array(12).fill(0);
    momRows.forEach(r => {
      if (r.year === currentYear) curTotals[r.month - 1] += r.total_tonnes;
      if (r.year === previousYear) prevTotals[r.month - 1] += r.total_tonnes;
    });
    const len = lastCurrentYearMonth;
    const curYTD = curTotals.slice(0, len).reduce((s, v) => s + v, 0);
    const prevYTD = prevTotals.slice(0, len).reduce((s, v) => s + v, 0);
    const ytdPct = prevYTD > 0 ? ((curYTD - prevYTD) / prevYTD) * 100 : null;
    let peakIdx = 0, peakVal = 0;
    curTotals.slice(0, len).forEach((v, i) => { if (v > peakVal) { peakVal = v; peakIdx = i; } });
    let dropIdx = -1, maxDrop = 0;
    curTotals.slice(0, len).forEach((v, i) => {
      const prev = prevTotals[i];
      if (prev > 0) { const p = ((v - prev) / prev) * 100; if (p < maxDrop) { maxDrop = p; dropIdx = i; } }
    });
    return {
      ytdPct,
      peakMonth: peakVal > 0 ? monthLabels[peakIdx] : null,
      dropMonth: dropIdx >= 0 ? monthLabels[dropIdx] : null,
    };
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

  // ── Chart options ──────────────────────────────────────────────────────────

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
      symbol: "circle",
      symbolSize: 4,
      showSymbol: false,
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
    grid: { left: "8%", right: "10%", bottom: "12%", top: "18%" },
    xAxis: {
      type: "category",
      data: growthData.map(d => d.month),
      axisLine: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e" },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "Tonnes",
        nameTextStyle: { color: "#8b949e" },
        axisLabel: { color: "#8b949e" },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      {
        type: "value",
        name: "Growth %",
        position: "right",
        nameTextStyle: { color: "#8b949e" },
        axisLabel: { color: "#8b949e", formatter: "{value}%" },
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
          fontSize: 9,
          color: "#8b949e",
          // @ts-ignore
          formatter: (p) => p.value != null && p.value > 0 ? `${Number(p.value / 1000).toFixed(1)}k` : "",
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
          fontSize: 9,
          color: "#f87171",
          // @ts-ignore
          formatter: (p) => p.value != null ? `${Number(p.value).toFixed(0)}%` : "",
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
        type: "group",
        left: "29%",
        top: "middle",
        children: [
          {
            type: "text",
            z: 100,
            left: "center",
            top: -14,
            style: { text: "Total", fill: "#8b949e", fontSize: 10, fontFamily: "system-ui", textAlign: "center" },
          },
          {
            type: "text",
            z: 100,
            left: "center",
            top: 2,
            style: {
              text: `${numberFormatter.format(total)} t`,
              fill: "#e6edf3",
              fontSize: 14,
              fontWeight: "bold",
              fontFamily: "system-ui",
              textAlign: "center",
            },
          },
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
        data: divisionBreakdown.map((d) => ({
          name: d.label,
          value: d.total_tonnes,
          itemStyle: { color: divisionColors[d.company_no] ?? "#818cf8" },
        })),
      }],
    };
  }, [divisionBreakdown]);

  const loadingOverlay = (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Loading…
      </div>
    </div>
  );

  const mtd = predictive?.mtd_projection;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: scrollable dashboard ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-5 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between pb-1 border-b border-border">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">PSS Analytics</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Sales tonnage dashboard — {companyLabel}</p>
            </div>
            <DataFreshnessIndicator freshness={freshness} />
          </div>

          {/* Date range display */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-secondary text-xs text-muted-foreground">
            <span className="font-medium text-foreground uppercase tracking-wider text-[10px]">
              {isAllTime ? "All time" : "Custom range"}
            </span>
            <span className="text-border">·</span>
            {formatDateLabel(dateFrom)} — {formatDateLabel(dateTo)}
          </div>

          {/* KPI cards */}
          <DashboardKpiGrid
            totalTonnes={totalTonnes}
            lyTonnes={lyTonnes}
            salesRows={salesRows}
            mtd={predictive?.mtd_projection ?? null}
            atRiskCustomers={predictive?.customer_lapse_risk.length ?? 0}
            activeCustomers={movementSummary?.active_customers ?? 0}
            loading={loading}
            predictiveLoading={predictiveLoading}
          />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
          )}

          {/* Commercial Action Center */}
          <CommercialActionCenter
            predictive={predictive}
            loading={predictiveLoading}
            onSelectCustomer={setSelectedRisk}
          />

          {/* Performance & Trend Analysis */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border/60">
              <h2 className="text-[13px] font-semibold text-foreground">Performance & Trend Analysis</h2>
            </div>

            {/* Row 1: MoM + Monthly Growth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* Month-on-month comparison */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Month-on-month comparison</h3>
                </div>
                {momChips && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {momChips.ytdPct != null && (
                      <InsightChip
                        label={`${currentYear} vs ${previousYear}: ${momChips.ytdPct >= 0 ? "+" : ""}${momChips.ytdPct.toFixed(0)}%`}
                        variant={momChips.ytdPct >= 0 ? "green" : "red"}
                      />
                    )}
                    {momChips.peakMonth && (
                      <InsightChip label={`↑ Peak month: ${momChips.peakMonth}`} variant="green" />
                    )}
                    {momChips.dropMonth && (
                      <InsightChip label={`↓ Sharpest drop: ${momChips.dropMonth}`} variant="red" />
                    )}
                  </div>
                )}
                <div className="h-[256px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={monthlyComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground/50">Actuals &nbsp;·&nbsp; - - - Not yet available &nbsp;·&nbsp; All values in tonnes</p>
              </div>

              {/* Monthly growth */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Monthly growth</h3>
                </div>
                {growthChips && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {growthChips.bestMonth && (
                      <InsightChip label={`↑ Best month: ${growthChips.bestMonth}`} variant="green" />
                    )}
                    {growthChips.avg > 0 && (
                      <InsightChip label={`Avg: ${numberFormatter.format(growthChips.avg)} t`} variant="blue" />
                    )}
                    <InsightChip
                      label={`Trend: ${growthChips.trend}`}
                      variant={growthChips.trend === "Growing" ? "green" : growthChips.trend === "Declining" ? "red" : "neutral"}
                    />
                  </div>
                )}
                <div className="h-[256px]">
                  {momLoading ? loadingOverlay : (
                    <ReactECharts option={growthOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  )}
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground/50">Growth % vs prior year &nbsp;·&nbsp; All values in tonnes</p>
              </div>
            </div>

            {/* Row 2: Cumulative full width */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3 className="text-xs font-semibold text-foreground">Cumulative sales comparison</h3>
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

            {/* Row 3: Division + Product Group Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* Sales by division */}
              {(companyNos.includes("all") || companyNos.length > 1) ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-foreground">Sales by division</h3>
                    <span className="text-[9px] text-muted-foreground/60">All values in tonnes</span>
                  </div>
                  {loading ? loadingOverlay : divisionChartOptions ? (
                    <div className="flex gap-2 h-[240px]">
                      <div className="flex-shrink-0 w-[160px]">
                        <ReactECharts option={divisionChartOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center py-2">
                        {/* Table header */}
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
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${share}%`, background: `${color}cc` }}
                                  />
                                </div>
                              </div>
                            );
                          });
                        })()}
                        <div className="mt-2 text-[9px] text-muted-foreground/50">
                          {divisionBreakdown.length} divisions · 100.0%
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-muted-foreground text-sm">No data</div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-xs font-semibold text-foreground mb-3">Sales rep contribution</h3>
                  <div className="h-[240px]">
                    {loading ? loadingOverlay : !summary?.rep_contribution?.length ? (
                      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No rep data</div>
                    ) : (
                      <ReactECharts
                        option={{
                          ...darkChartBase,
                          tooltip: {
                            ...darkChartBase.tooltip,
                            trigger: "item",
                            // @ts-ignore
                            formatter: (p) => `${p.name}: ${numberFormatter.format(p.value)} t (${p.percent}%)`,
                          },
                          legend: { orient: "vertical", left: "left", top: "middle", textStyle: { color: "#8b949e" } },
                          series: [{
                            name: "Sales rep",
                            type: "pie",
                            radius: ["40%", "68%"],
                            center: ["60%", "50%"],
                            avoidLabelOverlap: true,
                            itemStyle: { borderRadius: 4, borderColor: "#161b22", borderWidth: 2 },
                            label: { show: false },
                            emphasis: { label: { show: true, fontSize: 13, fontWeight: "bold", color: "#e6edf3" } },
                            labelLine: { show: false },
                            data: (() => {
                              const rows = summary.rep_contribution;
                              const top = rows.slice(0, 5);
                              const others = rows.slice(5).reduce((s, r) => s + r.total_tonnes, 0);
                              const all = others > 0 ? [...top, { salesperson: "Other", total_tonnes: others }] : top;
                              return all.map((e, i) => ({
                                name: e.salesperson,
                                value: e.total_tonnes,
                                itemStyle: { color: chartColors[i % chartColors.length] },
                              }));
                            })(),
                          }],
                        }}
                        style={{ width: "100%", height: "100%" }}
                        notMerge
                        lazyUpdate
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Product group trends */}
              {!predictiveLoading && predictive && predictive.product_group_trends.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-foreground">Product group trends (3m vs prior 3m)</h3>
                    <span className="text-[9px] text-muted-foreground/60">All values in tonnes</span>
                  </div>
                  <div className="h-[240px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="text-muted-foreground/60 text-[9px] uppercase tracking-wide">
                          <th className="text-left pb-2 font-semibold pr-2">Group</th>
                          <th className="text-right pb-2 font-semibold">Curr 3m</th>
                          <th className="text-right pb-2 font-semibold">Prior 3m</th>
                          <th className="text-right pb-2 font-semibold">Δ</th>
                          <th className="text-center pb-2 font-semibold">Trend</th>
                          <th className="text-center pb-2 font-semibold">Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {predictive.product_group_trends.map(g => {
                          const isGrowing = g.trend === "growing" || g.trend === "new";
                          const isDeclining = g.trend === "declining" || g.trend === "stopped";
                          const sparkColor = isGrowing ? "#34d399" : isDeclining ? "#f87171" : "#8b949e";
                          return (
                            <tr key={g.code} className="border-t border-border/50 hover:bg-accent/10 transition-colors">
                              <td className="py-1.5 text-foreground font-medium truncate max-w-[110px] pr-2">{g.name || g.code}</td>
                              <td className="py-1.5 text-right text-muted-foreground whitespace-nowrap text-[10px]">{formatTonnes(g.current_3m_tonnes)}</td>
                              <td className="py-1.5 text-right text-muted-foreground whitespace-nowrap text-[10px]">{formatTonnes(g.prior_3m_tonnes)}</td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {g.pct_change != null ? (
                                  <span className={`text-[10px] font-semibold ${isGrowing ? "text-emerald-400" : isDeclining ? "text-red-400" : "text-muted-foreground"}`}>
                                    {isGrowing ? "↑" : isDeclining ? "↓" : ""} {Math.abs(g.pct_change).toFixed(1)}%
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-1.5">
                                <div className="flex justify-center">
                                  {(g.prior_3m_tonnes > 0 || g.current_3m_tonnes > 0) ? (
                                    <ProdGroupSparkline prior={g.prior_3m_tonnes} current={g.current_3m_tonnes} color={sparkColor} />
                                  ) : <span className="text-muted-foreground text-[10px]">—</span>}
                                </div>
                              </td>
                              <td className="py-1.5 text-center">
                                {isGrowing ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                    ↑ Growing
                                  </span>
                                ) : isDeclining ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/12 text-red-400 border border-red-500/20 whitespace-nowrap">
                                    ↓ Declining
                                  </span>
                                ) : g.trend === "stable" ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-500/12 text-slate-400 border border-slate-500/20 whitespace-nowrap">
                                    Stable
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                                    Watch
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <button className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors">
                      View all product groups <ArrowRight01Icon size={10} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Floating AI drawer (fixed overlay, no layout impact) ── */}
      <AIFloatingDrawer companyNos={companyNos} saleScope={saleScope} dateFrom={dateFrom} dateTo={dateTo} />

      {/* ── Customer drilldown modal ── */}
      {selectedRisk && (
        <CustomerDrilldownModal
          open={!!selectedRisk}
          onClose={() => setSelectedRisk(null)}
          customerCode={selectedRisk.customer_code}
          customerName={selectedRisk.customer_name}
          revenueTier={selectedRisk.revenue_tier}
          tonnes6mPrior={selectedRisk.tonnes_6m_prior}
          lastPurchaseDate={selectedRisk.last_purchase_date}
          daysSince={selectedRisk.days_since_purchase}
          companyNos={companyNos}
          saleScope={saleScope}
        />
      )}
    </div>
  );
}
