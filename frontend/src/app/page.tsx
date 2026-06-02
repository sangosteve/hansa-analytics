"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import ReactECharts from "echarts-for-react";

import { getSalesSummary, SalesSummaryResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const chartColors = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
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

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${String(date.getDate()).padStart(2, "0")} ${monthNames[date.getMonth()]}, ${date.getFullYear()}`;
}

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
      const point: Record<string, number | string> = {
        month: monthLabels[index],
      };

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
      if (row.year === currentYear) {
        currentTotals[row.month - 1] += row.total_tonnes;
      }

      if (row.year === previousYear) {
        previousTotals[row.month - 1] += row.total_tonnes;
      }
    });

    return currentTotals.map((total, index) => {
      const prior = previousTotals[index];
      const growth = prior === 0 ? 0 : ((total - prior) / prior) * 100;
      return {
        month: monthLabels[index],
        current: total,
        growth,
      };
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
    tooltip: {
      trigger: "axis",
      formatter: (params: any) =>
        params
          .map(
            (item: any) =>
              `${item.seriesName}: ${numberFormatter.format(item.value)} t`
          )
          .join("<br />"),
    },
    legend: {
      data: years.map((year) => String(year)),
      top: "5%",
    },
    grid: {
      left: "10%",
      right: "10%",
      bottom: "12%",
      top: "18%",
    },
    xAxis: {
      type: "category",
      data: monthlyComparisonData.map((item) => item.month),
    },
    yAxis: {
      type: "value",
      name: "Tonnes",
    },
    series: years.map((year, index) => ({
      name: String(year),
      type: "line",
      data: monthlyComparisonData.map((item) => item[`year${year}`] ?? 0),
      smooth: true,
      lineStyle: { width: 3, color: chartColors[index % chartColors.length] },
      symbol: "circle",
      showSymbol: false,
    })),
  } as const), [monthlyComparisonData, years]);

  const growthOptions = useMemo(() => ({
    tooltip: {
      trigger: "axis",
      formatter: (params: any) =>
        params
          .map((item: any) => {
            if (item.seriesName === "Growth %") {
              return `${item.seriesName}: ${Number(item.value).toFixed(2)}%`;
            }
            return `${item.seriesName}: ${numberFormatter.format(item.value)} t`;
          })
          .join("<br />"),
    },
    legend: {
      data: ["Current year", "Growth %"],
      top: "5%",
    },
    grid: {
      left: "10%",
      right: "10%",
      bottom: "12%",
      top: "18%",
    },
    xAxis: {
      type: "category",
      data: growthData.map((item) => item.month),
    },
    yAxis: [
      {
        type: "value",
        name: "Tonnes",
      },
      {
        type: "value",
        name: "Growth %",
        position: "right",
        axisLabel: {
          formatter: "{value}%",
        },
      },
    ],
    series: [
      {
        name: "Current year",
        type: "bar",
        data: growthData.map((item) => item.current),
        itemStyle: { color: "#4f46e5" },
      },
      {
        name: "Growth %",
        type: "line",
        yAxisIndex: 1,
        data: growthData.map((item) => Number(item.growth.toFixed(2))),
        smooth: true,
        lineStyle: { width: 3, color: "#ef4444" },
        symbol: "circle",
        showSymbol: false,
      },
    ],
  } as const), [growthData]);

  const cumulativeComparisonOptions = useMemo(() => ({
    tooltip: {
      trigger: "axis",
      formatter: (params: any) =>
        params
          .map(
            (item: any) =>
              `${item.seriesName}: ${numberFormatter.format(item.value)} t`
          )
          .join("<br />"),
    },
    legend: {
      data: years.map((year) => String(year)),
      top: "5%",
    },
    grid: {
      left: "10%",
      right: "10%",
      bottom: "12%",
      top: "18%",
    },
    xAxis: {
      type: "category",
      data: cumulativeComparisonData.map((item) => item.month),
    },
    yAxis: {
      type: "value",
      name: "Tonnes",
    },
    series: years.map((year, index) => ({
      name: String(year),
      type: "line",
      data: cumulativeComparisonData.map((item) => item[`year${year}`] ?? 0),
      smooth: true,
      lineStyle: { width: 3, color: chartColors[index % chartColors.length] },
      showSymbol: false,
    })),
  } as const), [cumulativeComparisonData, years]);

  const repOptions = useMemo(() => ({
    tooltip: {
      trigger: "item",
      formatter: (params: any) =>
        `${params.name}: ${numberFormatter.format(params.value)} t (${params.percent}%)`,
    },
    legend: {
      orient: "vertical",
      left: "left",
      top: "middle",
    },
    series: [
      {
        name: "Sales rep",
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: "#fff",
          borderWidth: 2,
        },
        label: {
          show: false,
          position: "center",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        labelLine: {
          show: false,
        },
        data: repData.map((entry) => ({
          name: entry.salesperson,
          value: entry.total_tonnes,
        })),
      },
    ],
  } as const), [repData]);

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

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Hansa Analytics Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Compare company sales and filter by date.
            </p>
          </div>

          <Button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="w-full md:w-auto"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing..." : "Refresh Data"}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Company</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={companyNo} onValueChange={setCompanyNo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Company 1</SelectItem>
                  <SelectItem value="3">Company 3</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Start Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">End Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Loaded range</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">
                {formatDateLabel(dateFrom)} — {formatDateLabel(dateTo)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 mt-6 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total tonnes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-900">
                {formatTonnes(totalTonnes)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top salesperson</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-900">
                {topSalesperson}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {formatTonnes(topRepTonnes)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Years returned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-900">
                {years.length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current company</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-900">
                {companyNo}
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 mt-6 xl:grid-cols-2">
          <Card className="min-h-[420px]">
            <CardHeader>
              <CardTitle>Month-on-month sales comparison</CardTitle>
            </CardHeader>
            <CardContent className="h-[380px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  Loading data...
                </div>
              ) : (
                <ReactECharts
                  option={monthlyComparisonOptions}
                  style={{ width: "100%", height: "100%" }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[420px]">
            <CardHeader>
              <CardTitle>Monthly sales growth</CardTitle>
            </CardHeader>
            <CardContent className="h-[380px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  Loading data...
                </div>
              ) : (
                <ReactECharts
                  option={growthOptions}
                  style={{ width: "100%", height: "100%" }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[420px] xl:col-span-2">
            <CardHeader>
              <CardTitle>Cumulative sales comparison</CardTitle>
            </CardHeader>
            <CardContent className="h-[380px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  Loading data...
                </div>
              ) : (
                <ReactECharts
                  option={cumulativeComparisonOptions}
                  style={{ width: "100%", height: "100%" }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[420px]">
            <CardHeader>
              <CardTitle>Sales rep contribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[380px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  Loading data...
                </div>
              ) : repData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  No rep data available.
                </div>
              ) : (
                <ReactECharts
                  option={repOptions}
                  style={{ width: "100%", height: "100%" }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <AIInsightsPanel />
        </div>
      </div>
    </main>
  );
}
