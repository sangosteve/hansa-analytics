import { useEffect, useMemo, useState } from "react";
import {
  Building01Icon,
  Alert01Icon,
  ChartDownIcon,
  Activity01Icon,
  Package01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  ChartUpIcon,
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
import DashboardKpiGrid from "@/components/home/dashboard-kpi-grid";
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

function pctBadge(pct: number | null) {
  if (pct === null) return null;
  const cls = pct >= 0 ? "text-emerald-400" : "text-red-400";
  return <span className={`text-[10px] font-medium ${cls}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

function trendIcon(trend: string) {
  if (trend === "growing" || trend === "new") return <ChartUpIcon size={12} className="text-emerald-400" />;
  if (trend === "declining" || trend === "stopped") return <ChartDownIcon size={12} className="text-red-400" />;
  return <Activity01Icon size={12} className="text-yellow-400" />;
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

  // Loads date-filtered KPI data + predictive (re-runs on any filter change)
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

  // Loads all-time MoM comparison data (only re-runs when company or scope changes)
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
      // non-critical — customer health card shows zeros
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

  // Freshness on mount
  useEffect(() => { loadFreshness(); }, []);

  // When a Hansa→Neon refresh completes, re-fetch all data automatically
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

  // Date-filtered rows → KPI numbers, division breakdown
  const salesRows = summary?.monthly_sales ?? [];
  // All-time rows → MoM comparison charts (unaffected by date range filter)
  const momRows = momSummary?.monthly_sales ?? [];

  // MoM chart data — uses all-time momRows, NOT affected by date range
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

  // Date-filtered total for KPI card
  const totalTonnes = useMemo(() => salesRows.reduce((sum, row) => sum + row.total_tonnes, 0), [salesRows]);

  // Same period last year — filter momRows to the same month range but previous year(s)
  const lyTonnes = useMemo(() => {
    if (!momRows.length) return 0;
    const dfDate = new Date(dateFrom);
    const dtDate = new Date(dateTo);
    const fromYear = dfDate.getFullYear() - 1;
    const toYear = dtDate.getFullYear() - 1;
    const fromMonth = dfDate.getMonth() + 1; // 1-indexed
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

  const topGroup = useMemo(() => {
    if (!predictive?.product_group_trends?.length) return null;
    const sorted = [...predictive.product_group_trends].sort((a, b) => b.current_3m_tonnes - a.current_3m_tonnes);
    return sorted[0] ?? null;
  }, [predictive]);

  const growingGroups = useMemo(
    () => predictive?.product_group_trends.filter((g) => g.trend === "growing") ?? [],
    [predictive]
  );

  const divisionBreakdown = summary?.division_breakdown ?? [];

  // ── Chart options ─────────────────────────────────────────────────────────

  const monthlyComparisonOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: { ...darkChartBase.tooltip, trigger: "axis",
      // @ts-ignore
      formatter: (params) => params.map((item: { seriesName: string; value: number }) =>
        `${item.seriesName}: ${numberFormatter.format(item.value)} t`).join("<br />"),
    },
    legend: { data: momYears.map((y) => String(y)), top: "4%", textStyle: { color: "#8b949e" } },
    grid: { left: "8%", right: "4%", bottom: "12%", top: "18%" },
    xAxis: { type: "category", data: monthlyComparisonData.map((d) => d.month),
      axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e" }, splitLine: { show: false } },
    yAxis: { type: "value", name: "Tonnes", nameTextStyle: { color: "#8b949e" },
      axisLabel: { color: "#8b949e" }, splitLine: { lineStyle: { color: "#21262d" } } },
    series: momYears.map((year, index) => ({
      name: String(year), type: "line",
      data: monthlyComparisonData.map((d) => d[`year${year}`] ?? 0),
      smooth: true, lineStyle: { width: 2, color: chartColors[index % chartColors.length] },
      itemStyle: { color: chartColors[index % chartColors.length] },
      symbol: "circle", symbolSize: 4, showSymbol: false,
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: `${chartColors[index % chartColors.length]}30` }, { offset: 1, color: "transparent" }] } },
    })),
  }), [monthlyComparisonData, momYears]);

  const growthOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: { ...darkChartBase.tooltip, trigger: "axis",
      // @ts-ignore
      formatter: (params) => params.map((item: { seriesName: string; value: number }) =>
        item.seriesName === "Growth %" ? `${item.seriesName}: ${Number(item.value).toFixed(2)}%`
          : `${item.seriesName}: ${numberFormatter.format(item.value)} t`).join("<br />"),
    },
    legend: { data: ["Current year", "Growth %"], top: "4%", textStyle: { color: "#8b949e" } },
    grid: { left: "8%", right: "10%", bottom: "12%", top: "18%" },
    xAxis: { type: "category", data: growthData.map((d) => d.month),
      axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e" }, splitLine: { show: false } },
    yAxis: [
      { type: "value", name: "Tonnes", nameTextStyle: { color: "#8b949e" },
        axisLabel: { color: "#8b949e" }, splitLine: { lineStyle: { color: "#21262d" } } },
      { type: "value", name: "Growth %", position: "right", nameTextStyle: { color: "#8b949e" },
        axisLabel: { color: "#8b949e", formatter: "{value}%" }, splitLine: { show: false } },
    ],
    series: [
      { name: "Current year", type: "bar", data: growthData.map((d) => d.current),
        itemStyle: { color: "#818cf8", borderRadius: [3, 3, 0, 0] } },
      { name: "Growth %", type: "line", yAxisIndex: 1,
        data: growthData.map((d) => Number(d.growth.toFixed(2))),
        smooth: true, lineStyle: { width: 2, color: "#f87171" },
        itemStyle: { color: "#f87171" }, symbol: "circle", symbolSize: 4, showSymbol: false },
    ],
  }), [growthData]);

  const cumulativeComparisonOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: { ...darkChartBase.tooltip, trigger: "axis",
      // @ts-ignore
      formatter: (params) => params.map((item: { seriesName: string; value: number }) =>
        `${item.seriesName}: ${numberFormatter.format(item.value)} t`).join("<br />"),
    },
    legend: { data: momYears.map((y) => String(y)), top: "4%", textStyle: { color: "#8b949e" } },
    grid: { left: "8%", right: "4%", bottom: "12%", top: "18%" },
    xAxis: { type: "category", data: cumulativeComparisonData.map((d) => d.month),
      axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e" }, splitLine: { show: false } },
    yAxis: { type: "value", name: "Tonnes", nameTextStyle: { color: "#8b949e" },
      axisLabel: { color: "#8b949e" }, splitLine: { lineStyle: { color: "#21262d" } } },
    series: momYears.map((year, index) => ({
      name: String(year), type: "line",
      data: cumulativeComparisonData.map((d) => d[`year${year}`] ?? 0),
      smooth: true, lineStyle: { width: 2, color: chartColors[index % chartColors.length] },
      itemStyle: { color: chartColors[index % chartColors.length] }, showSymbol: false,
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: `${chartColors[index % chartColors.length]}25` }, { offset: 1, color: "transparent" }] } },
    })),
  }), [cumulativeComparisonData, momYears]);

  // Sales by Division chart (used when "all" is selected)
  const divisionChartOptions = useMemo(() => {
    if (!divisionBreakdown.length) return null;
    return {
      ...darkChartBase,
      tooltip: { ...darkChartBase.tooltip, trigger: "item",
        // @ts-ignore
        formatter: (p) => `${p.name}: ${numberFormatter.format(p.value)} t (${p.percent}%)`,
      },
      legend: { orient: "vertical", left: "left", top: "middle", textStyle: { color: "#8b949e" } },
      series: [{
        name: "Division", type: "pie", radius: ["40%", "68%"], center: ["60%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: "#161b22", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: "bold", color: "#e6edf3" } },
        labelLine: { show: false },
        data: divisionBreakdown.map((d) => ({
          name: d.label, value: d.total_tonnes,
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

          {/* Predictive insight strip */}
          {!predictiveLoading && predictive && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Customer lapse risk */}
              <div className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Alert01Icon size={14} className="text-amber-400" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    At-risk customers
                  </span>
                </div>
                <div className="space-y-1 max-h-[130px] overflow-y-auto">
                  {predictive.customer_lapse_risk.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None identified</p>
                  ) : predictive.customer_lapse_risk.slice(0, 5).map((c) => (
                    <button
                      key={c.customer_code}
                      onClick={() => setSelectedRisk(c)}
                      className="w-full flex items-center justify-between rounded px-1.5 py-1 hover:bg-accent/30 transition-colors cursor-pointer group"
                    >
                      <span className="text-xs text-foreground truncate max-w-[140px] group-hover:text-primary transition-colors text-left">
                        {c.customer_name || c.customer_code}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
                          ${c.revenue_tier === "high" ? "bg-red-500/20 text-red-400" :
                            c.revenue_tier === "medium" ? "bg-amber-500/20 text-amber-400" :
                              "bg-muted text-muted-foreground"}`}>
                          {c.revenue_tier}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatTonnes(c.tonnes_6m_prior)}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {predictive.customer_lapse_risk.length} total at risk
                </div>
              </div>

              {/* Products to push */}
              <div className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <ChartDownIcon size={14} className="text-blue-400" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Products to push
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                  {predictive.products_to_push.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No declining products</p>
                  ) : predictive.products_to_push.slice(0, 5).map((p) => (
                    <div key={p.item_code} className="flex items-center justify-between">
                      <span className="text-xs text-foreground truncate max-w-[140px]">
                        {p.item_name || p.item_code}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {pctBadge(p.pct_change)}
                        <span className="text-[10px] text-muted-foreground">{formatTonnes(p.prior_3m_tonnes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {predictive.products_to_push.length} items with ≥20% volume decline
                </div>
              </div>

              {/* Growing product groups (replaces Rep Trends) */}
              <div className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <ChartUpIcon size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Growing groups (3m)
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                  {growingGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No growing groups</p>
                  ) : growingGroups.slice(0, 5).map((g) => (
                    <div key={g.code} className="flex items-center justify-between">
                      <span className="text-xs text-foreground truncate max-w-[130px]">
                        {g.name || g.code}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {pctBadge(g.pct_change)}
                        <span className="text-[10px] text-muted-foreground">{formatTonnes(g.current_3m_tonnes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {growingGroups.length} of {predictive.product_group_trends.length} groups growing
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">Month-on-month comparison</h3>
              <div className="h-[280px]">
                {momLoading ? loadingOverlay : (
                  <ReactECharts option={monthlyComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">Monthly growth</h3>
              <div className="h-[280px]">
                {momLoading ? loadingOverlay : (
                  <ReactECharts option={growthOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                )}
              </div>
            </div>
            <div className="col-span-1 lg:col-span-2 rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">Cumulative sales comparison</h3>
              <div className="h-[240px]">
                {momLoading ? loadingOverlay : (
                  <ReactECharts option={cumulativeComparisonOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                )}
              </div>
            </div>

            {/* Division breakdown (all) OR product group trends table */}
            {(companyNos.includes("all") || companyNos.length > 1) ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3">Sales by division</h3>
                <div className="h-[260px]">
                  {loading ? loadingOverlay : divisionChartOptions ? (
                    <ReactECharts option={divisionChartOptions} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No data</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3">Sales rep contribution</h3>
                <div className="h-[260px]">
                  {loading ? loadingOverlay : !summary?.rep_contribution?.length ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No rep data</div>
                  ) : (
                    <ReactECharts
                      option={{
                        ...darkChartBase,
                        tooltip: { ...darkChartBase.tooltip, trigger: "item",
                          // @ts-ignore
                          formatter: (p) => `${p.name}: ${numberFormatter.format(p.value)} t (${p.percent}%)`,
                        },
                        legend: { orient: "vertical", left: "left", top: "middle", textStyle: { color: "#8b949e" } },
                        series: [{
                          name: "Sales rep", type: "pie", radius: ["40%", "68%"], center: ["60%", "50%"],
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
                              name: e.salesperson, value: e.total_tonnes,
                              itemStyle: { color: chartColors[i % chartColors.length] },
                            }));
                          })(),
                        }],
                      }}
                      style={{ width: "100%", height: "100%" }} notMerge lazyUpdate
                    />
                  )}
                </div>
              </div>
            )}

            {/* Product group trends table */}
            {!predictiveLoading && predictive && predictive.product_group_trends.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3">Product group trends (3m vs prior 3m)</h3>
                <div className="h-[260px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1.5 font-medium">Group</th>
                        <th className="text-right pb-1.5 font-medium">Current 3m</th>
                        <th className="text-right pb-1.5 font-medium">Prior 3m</th>
                        <th className="text-right pb-1.5 font-medium">Δ</th>
                        <th className="text-center pb-1.5 font-medium">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictive.product_group_trends.map((g) => (
                        <tr key={g.code} className="border-t border-border/50">
                          <td className="py-1 text-foreground truncate max-w-[120px] pr-2">{g.name || g.code}</td>
                          <td className="py-1 text-right text-muted-foreground">{formatTonnes(g.current_3m_tonnes)}</td>
                          <td className="py-1 text-right text-muted-foreground">{formatTonnes(g.prior_3m_tonnes)}</td>
                          <td className="py-1 text-right">{pctBadge(g.pct_change)}</td>
                          <td className="py-1 text-center">
                            <div className="flex justify-center">{trendIcon(g.trend)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
