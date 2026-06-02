import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingUp, Users, Calendar, Building2 } from "lucide-react";
import ReactECharts from "echarts-for-react";

import { getSalesSummary, type SalesSummaryResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AIInsightsPanel from "@/components/ai/ai-insights-panel";

const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const chartColors = [
  "#818cf8", "#34d399", "#fb923c", "#f87171", "#a78bfa", "#38bdf8",
];

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatTonnes(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${numberFormatter.format(value)} t`;
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${monthNames[date.getMonth()]}, ${date.getFullYear()}`;
}

const darkChartBase = {
  backgroundColor: "transparent",
  textStyle: { color: "#8b949e" },
  tooltip: {
    backgroundColor: "#1c2128",
    borderColor: "#30363d",
    textStyle: { color: "#e6edf3" },
  },
};

export default function Home() {
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companyNo, setCompanyNo] = useState("3");
  const [dateFrom, setDateFrom] = useState("2025-01-01");
  const [dateTo, setDateTo] = useState("2026-12-31");
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSalesSummary(dateFrom, dateTo, companyNo);
      setSummary(data);
    } catch (err) {
      setError("Unable to load sales summary. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyNo, dateFrom, dateTo]);

  const salesRows = summary?.monthly_sales ?? [];

  const years = useMemo(
    () => Array.from(new Set(salesRows.map((row) => row.year))).sort(),
    [salesRows]
  );

  const currentYear = years[years.length - 1];
  const previousYear = years[years.length - 2];

  const monthlyComparisonData = useMemo(() => {
    const monthMap = new Map<number, Record<string, number | string>>();
    for (let month = 1; month <= 12; month += 1) {
      monthMap.set(month, { month: monthLabels[month - 1] });
    }
    salesRows.forEach((row) => {
      const record = monthMap.get(row.month);
      if (!record) return;
      record[`year${row.year}`] = row.total_tonnes;
    });
    return Array.from(monthMap.values());
  }, [salesRows]);

  const cumulativeComparisonData = useMemo(() => {
    const yearMonthTotals = new Map<number, number[]>();
    years.forEach((year) => yearMonthTotals.set(year, Array(12).fill(0)));
    salesRows.forEach((row) => {
      const totals = yearMonthTotals.get(row.year);
      if (!totals) return;
      totals[row.month - 1] += row.total_tonnes;
    });
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const point: Record<string, number | string> = { month: monthLabels[index] };
      years.forEach((year) => {
        const totals = yearMonthTotals.get(year) ?? [];
        const cumulative = totals.slice(0, month).reduce((sum, value) => sum + value, 0);
        point[`year${year}`] = cumulative;
      });
      return point;
    });
  }, [salesRows, years]);

  const growthData = useMemo(() => {
    if (!currentYear) return [];
    const currentTotals = new Array(12).fill(0);
    const previousTotals = new Array(12).fill(0);
    salesRows.forEach((row) => {
      if (row.year === currentYear) currentTotals[row.month - 1] += row.total_tonnes;
      if (row.year === previousYear) previousTotals[row.month - 1] += row.total_tonnes;
    });
    return currentTotals.map((total, index) => {
      const prior = previousTotals[index];
      const growth = prior === 0 ? 0 : ((total - prior) / prior) * 100;
      return { month: monthLabels[index], current: total, growth };
    });
  }, [currentYear, previousYear, salesRows]);

  const repData = useMemo(() => {
    const rows = summary?.rep_contribution ?? [];
    const topRows = rows.slice(0, 5);
    const others = rows.slice(5).reduce((sum, row) => sum + row.total_tonnes, 0);
    return others > 0
      ? [...topRows, { salesperson: "Other", total_tonnes: others }]
      : topRows;
  }, [summary]);

  const monthlyComparisonOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: {
      ...darkChartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) =>
        params.map((item: { seriesName: string; value: number }) =>
          `${item.seriesName}: ${numberFormatter.format(item.value)} t`
        ).join("<br />"),
    },
    legend: {
      data: years.map((year) => String(year)),
      top: "4%",
      textStyle: { color: "#8b949e" },
    },
    grid: { left: "8%", right: "4%", bottom: "12%", top: "18%" },
    xAxis: {
      type: "category",
      data: monthlyComparisonData.map((item) => item.month),
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
    series: years.map((year, index) => ({
      name: String(year),
      type: "line",
      data: monthlyComparisonData.map((item) => item[`year${year}`] ?? 0),
      smooth: true,
      lineStyle: { width: 2, color: chartColors[index % chartColors.length] },
      itemStyle: { color: chartColors[index % chartColors.length] },
      symbol: "circle",
      symbolSize: 4,
      showSymbol: false,
      areaStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${chartColors[index % chartColors.length]}30` },
            { offset: 1, color: "transparent" },
          ],
        },
      },
    })),
  }), [monthlyComparisonData, years]);

  const growthOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: {
      ...darkChartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) =>
        params.map((item: { seriesName: string; value: number }) => {
          if (item.seriesName === "Growth %") {
            return `${item.seriesName}: ${Number(item.value).toFixed(2)}%`;
          }
          return `${item.seriesName}: ${numberFormatter.format(item.value)} t`;
        }).join("<br />"),
    },
    legend: {
      data: ["Current year", "Growth %"],
      top: "4%",
      textStyle: { color: "#8b949e" },
    },
    grid: { left: "8%", right: "10%", bottom: "12%", top: "18%" },
    xAxis: {
      type: "category",
      data: growthData.map((item) => item.month),
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
        name: "Current year",
        type: "bar",
        data: growthData.map((item) => item.current),
        itemStyle: { color: "#818cf8", borderRadius: [3, 3, 0, 0] },
      },
      {
        name: "Growth %",
        type: "line",
        yAxisIndex: 1,
        data: growthData.map((item) => Number(item.growth.toFixed(2))),
        smooth: true,
        lineStyle: { width: 2, color: "#f87171" },
        itemStyle: { color: "#f87171" },
        symbol: "circle",
        symbolSize: 4,
        showSymbol: false,
      },
    ],
  }), [growthData]);

  const cumulativeComparisonOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: {
      ...darkChartBase.tooltip,
      trigger: "axis",
      // @ts-ignore
      formatter: (params) =>
        params.map((item: { seriesName: string; value: number }) =>
          `${item.seriesName}: ${numberFormatter.format(item.value)} t`
        ).join("<br />"),
    },
    legend: {
      data: years.map((year) => String(year)),
      top: "4%",
      textStyle: { color: "#8b949e" },
    },
    grid: { left: "8%", right: "4%", bottom: "12%", top: "18%" },
    xAxis: {
      type: "category",
      data: cumulativeComparisonData.map((item) => item.month),
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
    series: years.map((year, index) => ({
      name: String(year),
      type: "line",
      data: cumulativeComparisonData.map((item) => item[`year${year}`] ?? 0),
      smooth: true,
      lineStyle: { width: 2, color: chartColors[index % chartColors.length] },
      itemStyle: { color: chartColors[index % chartColors.length] },
      showSymbol: false,
      areaStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${chartColors[index % chartColors.length]}25` },
            { offset: 1, color: "transparent" },
          ],
        },
      },
    })),
  }), [cumulativeComparisonData, years]);

  const repOptions = useMemo(() => ({
    ...darkChartBase,
    tooltip: {
      ...darkChartBase.tooltip,
      trigger: "item",
      // @ts-ignore
      formatter: (params) =>
        `${params.name}: ${numberFormatter.format(params.value)} t (${params.percent}%)`,
    },
    legend: {
      orient: "vertical",
      left: "left",
      top: "middle",
      textStyle: { color: "#8b949e" },
    },
    series: [
      {
        name: "Sales rep",
        type: "pie",
        radius: ["40%", "68%"],
        center: ["60%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: "#161b22", borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 13, fontWeight: "bold", color: "#e6edf3" },
        },
        labelLine: { show: false },
        data: repData.map((entry, i) => ({
          name: entry.salesperson,
          value: entry.total_tonnes,
          itemStyle: { color: chartColors[i % chartColors.length] },
        })),
      },
    ],
  }), [repData]);

  const totalTonnes = useMemo(
    () => salesRows.reduce((sum, row) => sum + row.total_tonnes, 0),
    [salesRows]
  );

  const topSalesperson = summary?.rep_contribution?.[0]?.salesperson ?? "-";
  const topRepTonnes = summary?.rep_contribution?.[0]?.total_tonnes ?? 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadSummary();
    } finally {
      setRefreshing(false);
    }
  };

  const loadingOverlay = (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Loading…
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ── Left: scrollable dashboard ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-1 border-b border-border">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Hansa Analytics
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sales tonnage dashboard — Company {companyNo}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="gap-1.5 text-xs h-8 border-border bg-secondary hover:bg-accent"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {/* Filters row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Company
              </label>
              <Select value={companyNo} onValueChange={setCompanyNo}>
                <SelectTrigger className="h-8 text-xs border-border bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="1" className="text-xs">Company 1</SelectItem>
                  <SelectItem value="3" className="text-xs">Company 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Start date
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-xs border-border bg-secondary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                End date
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-xs border-border bg-secondary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Range
              </label>
              <div className="h-8 flex items-center px-3 rounded-md border border-border bg-secondary text-xs text-muted-foreground">
                {formatDateLabel(dateFrom)} — {formatDateLabel(dateTo)}
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Total tonnes
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatTonnes(totalTonnes)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Top rep
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground truncate">
                {topSalesperson}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatTonnes(topRepTonnes)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Years
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {years.length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {years.join(", ") || "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Company
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {companyNo}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">
                Month-on-month comparison
              </h3>
              <div className="h-[280px]">
                {loading ? loadingOverlay : (
                  <ReactECharts
                    option={monthlyComparisonOptions}
                    style={{ width: "100%", height: "100%" }}
                    notMerge={true}
                    lazyUpdate={true}
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">
                Monthly growth
              </h3>
              <div className="h-[280px]">
                {loading ? loadingOverlay : (
                  <ReactECharts
                    option={growthOptions}
                    style={{ width: "100%", height: "100%" }}
                    notMerge={true}
                    lazyUpdate={true}
                  />
                )}
              </div>
            </div>

            <div className="col-span-2 rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">
                Cumulative sales comparison
              </h3>
              <div className="h-[240px]">
                {loading ? loadingOverlay : (
                  <ReactECharts
                    option={cumulativeComparisonOptions}
                    style={{ width: "100%", height: "100%" }}
                    notMerge={true}
                    lazyUpdate={true}
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">
                Sales rep contribution
              </h3>
              <div className="h-[260px]">
                {loading ? loadingOverlay : repData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No rep data
                  </div>
                ) : (
                  <ReactECharts
                    option={repOptions}
                    style={{ width: "100%", height: "100%" }}
                    notMerge={true}
                    lazyUpdate={true}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: AI sidebar ── */}
      <div className="w-[360px] flex-shrink-0 border-l border-border flex flex-col bg-card">
        <AIInsightsPanel />
      </div>
    </div>
  );
}
