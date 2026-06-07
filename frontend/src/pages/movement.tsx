import React, { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import {
  ChartUpIcon,
  ChartDownIcon,
  Alert01Icon,
  Package01Icon,
  UserGroupIcon,
  Package02Icon,
  ArrowUpRight01Icon,
  ArrowDownRight01Icon,
  MinusSignIcon,
  ArrowReloadHorizontalIcon,
  Building04Icon,
  ArrowReloadVerticalIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  SortByUp01Icon,
  SortByDown01Icon,
  Sorting05Icon,
  Download01Icon,
} from "hugeicons-react";
import { useCompany } from "@/lib/company-context";
import ReactECharts from "echarts-for-react";
import { ItemDrilldownModal } from "@/components/movement/item-drilldown-modal";

import {
  getMovementSummary,
  getProductGroupMovement,
  getSlowMovingItems,
  getCustomerMovementAnalytics,
  getProductGroupMonthly,
  getProductGroupItems,
  getCustomerGroups,
  getStockStatus,
  getStockSummary,
  triggerStockRefresh,
  type MovementSummary,
  type ProductGroupMovementRow,
  type SlowMovingItem,
  type CustomerMovementRow,
  type GroupMonthlyRow,
  type GroupItemRow,
  type CustomerGroupRow,
  type StockRow,
  type StockSummary,
} from "@/lib/api";

type TabId = "groups" | "items" | "customers" | "stock";

const STATUS_BADGE: Record<string, string> = {
  Growing:     "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  Stable:      "bg-sky-500/15 text-sky-400 border border-sky-500/25",
  Declining:   "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  Dead:        "bg-red-500/15 text-red-400 border border-red-500/25",
  New:         "bg-purple-500/15 text-purple-400 border border-purple-500/25",
  Active:      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  "At Risk":   "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  Stopped:     "bg-red-500/15 text-red-400 border border-red-500/25",
  Irregular:   "bg-slate-500/15 text-slate-400 border border-slate-500/25",
  "Dead Stock":"bg-red-500/15 text-red-400 border border-red-500/25",
  "Very Slow": "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  "Slow Mover":"bg-yellow-500/15 text-yellow-400 border border-yellow-500/25",
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmtT = (v: number | null | undefined) =>
  v == null ? "—" : `${fmt.format(v)} t`;
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`;

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE[status] ?? "bg-muted text-muted-foreground border border-border"}`}>
      {status}
    </span>
  );
}

function ChangeCell({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const isUp = pct > 0;
  const isFlat = Math.abs(pct) < 3;
  return (
    <span className={`flex items-center gap-0.5 font-medium ${isFlat ? "text-muted-foreground" : isUp ? "text-emerald-400" : "text-red-400"}`}>
      {isFlat ? <MinusSignIcon size={12} /> : isUp ? <ArrowUpRight01Icon size={12} /> : <ArrowDownRight01Icon size={12} />}
      {fmtPct(pct)}
    </span>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-border/40">
          {[...Array(cols)].map((__, j) => (
            <td key={j} className="px-3 py-2.5">
              <div className="h-3 rounded bg-muted/50 animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Sparkline mini-chart ──────────────────────────────────────────────────────
function GroupSparkline({ data }: { data: GroupMonthlyRow[] }) {
  const option = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: "category", show: false, data: data.map((d) => d.month) },
    yAxis: { type: "value", show: false },
    series: [{
      type: "line",
      data: data.map((d) => d.tonnes),
      smooth: true,
      symbol: "none",
      lineStyle: { width: 1.5, color: "#818cf8" },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#818cf830" }, { offset: 1, color: "transparent" }] } },
    }],
  }), [data]);

  return (
    <ReactECharts option={option} style={{ height: 40, width: 100 }} notMerge lazyUpdate />
  );
}

// ── Production-grade sort utilities ──────────────────────────────────────────
type SortDir = "asc" | "desc";
interface SortState { key: string; dir: SortDir }

function useSortableData<T extends Record<string, any>>(data: T[], initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      // nulls always sink to bottom regardless of direction
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, undefined, { sensitivity: "base" })
          : Number(va) - Number(vb);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sort]);

  const toggle = useCallback((key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }, []);

  return { sorted, sort, toggle };
}

function SortableHeader({
  label, sortKey, sort, onToggle, align = "right", className,
}: {
  label: string; sortKey: string; sort: SortState;
  onToggle: (k: string) => void; align?: "left" | "right"; className?: string;
}) {
  const active = sort.key === sortKey;
  const SortIcon = active
    ? sort.dir === "asc" ? SortByUp01Icon : SortByDown01Icon
    : Sorting05Icon;
  return (
    <th
      onClick={() => onToggle(sortKey)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 text-xs font-semibold select-none group transition-colors hover:text-foreground whitespace-nowrap cursor-pointer
        ${align === "right" ? "text-right" : "text-left"}
        ${active ? "text-foreground" : "text-muted-foreground"}
        ${className ?? ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
        {label}
        <SortIcon
          size={12}
          className={`flex-shrink-0 transition-opacity ${
            active ? "opacity-100" : "opacity-20 group-hover:opacity-50"
          }`}
        />
      </span>
    </th>
  );
}

function exportCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Product Groups tab ────────────────────────────────────────────────────────
const GROUP_FILTERS = ["All", "Growing", "Declining", "Stable", "Dead", "New"];

function ProductGroupsTab({ companyNos, saleScope }: { companyNos: string[]; saleScope: string }) {
  const [rows, setRows]                       = useState<ProductGroupMovementRow[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [filter, setFilter]                   = useState("All");
  const [selected, setSelected]               = useState<string | null>(null);
  const [drillTab, setDrillTab]               = useState<"products" | "trend">("products");
  const [monthlyData, setMonthlyData]         = useState<GroupMonthlyRow[]>([]);
  const [monthlyLoading, setMonthlyLoading]   = useState(false);
  const [drillItems, setDrillItems]           = useState<GroupItemRow[]>([]);
  const [drillItemsLoading, setDrillItemsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getProductGroupMovement(companyNos, saleScope)
      .then(setRows)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope]);

  const filtered = useMemo(
    () => (filter === "All" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  const { sorted: groupSorted, sort: groupSort, toggle: groupToggle } =
    useSortableData(filtered, { key: "total_tonnes", dir: "desc" });

  const { sorted: drillSorted, sort: drillSort, toggle: drillToggle } =
    useSortableData(drillItems, { key: "total_tonnes", dir: "desc" });

  const handleSelect = async (code: string) => {
    if (selected === code) { setSelected(null); return; }
    setSelected(code);
    setDrillTab("products");
    setMonthlyLoading(true);
    setDrillItemsLoading(true);
    try {
      const [monthlyResult, itemsResult] = await Promise.all([
        getProductGroupMonthly(code, companyNos, saleScope),
        getProductGroupItems(code, companyNos, saleScope),
      ]);
      setMonthlyData(monthlyResult);
      setDrillItems(itemsResult);
    } finally {
      setMonthlyLoading(false);
      setDrillItemsLoading(false);
    }
  };

  const selectedRow = rows.find((r) => r.group_code === selected);

  const drilldownOptions = useMemo(() => {
    if (!monthlyData.length) return null;
    return {
      backgroundColor: "transparent",
      textStyle: { color: "#8b949e" },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1c2128",
        borderColor: "#30363d",
        textStyle: { color: "#e6edf3" },
        // @ts-ignore
        formatter: (p) => p.map((i) => `${i.seriesName}: ${fmt.format(i.value)} t`).join("<br>"),
      },
      legend: { data: ["Tonnes"], top: "2%", textStyle: { color: "#8b949e" } },
      grid: { left: "8%", right: "4%", top: "14%", bottom: "12%" },
      xAxis: {
        type: "category",
        data: monthlyData.map((d) => d.month.slice(0, 7)),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: "#8b949e", rotate: 30, fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Tonnes",
        nameTextStyle: { color: "#8b949e" },
        axisLabel: { color: "#8b949e" },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [{
        name: "Tonnes",
        type: "bar",
        data: monthlyData.map((d) => d.tonnes),
        itemStyle: { color: "#818cf8", borderRadius: [3, 3, 0, 0] },
      }],
    };
  }, [monthlyData]);

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {GROUP_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f !== "All" && (
              <span className="ml-1.5 opacity-60">
                {rows.filter((r) => r.status === f).length}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => exportCSV(groupSorted, `product-groups-${new Date().toISOString().slice(0,10)}.csv`)}
          disabled={groupSorted.length === 0}
          className="ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-40"
        >
          <Download01Icon size={12} />
          Export CSV
        </button>
      </div>

      {/* Drilldown panel */}
      {selected && selectedRow && (
        <div className="rounded-lg border border-primary/30 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedRow.group_name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {selectedRow.unique_items} products · {selectedRow.unique_customers} customers
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border overflow-hidden text-[10px]">
                <button
                  onClick={() => setDrillTab("products")}
                  className={`px-2.5 py-1 transition-colors ${drillTab === "products" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Products
                </button>
                <button
                  onClick={() => setDrillTab("trend")}
                  className={`px-2.5 py-1 transition-colors border-l border-border ${drillTab === "trend" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Trend
                </button>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
            </div>
          </div>

          {drillTab === "trend" ? (
            monthlyLoading ? (
              <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">Loading…</div>
            ) : drilldownOptions ? (
              <ReactECharts option={drilldownOptions} style={{ height: 180 }} notMerge lazyUpdate />
            ) : null
          ) : drillItemsLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">Loading products…</div>
          ) : (
            <div className="rounded border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <SortableHeader label="Product"     sortKey="item_name"     sort={drillSort} onToggle={drillToggle} align="left" />
                    <SortableHeader label="Total t"     sortKey="total_tonnes"  sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Qty Bought"  sortKey="qty_bought"    sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Qty On Hand" sortKey="qty_on_hand"   sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Recent 3m"   sortKey="t3m"           sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Prior 3m"    sortKey="p3m"           sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="3m Δ"        sortKey="change_pct"    sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Last Sale"   sortKey="last_sale"     sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Days Ago"    sortKey="days_since"    sort={drillSort} onToggle={drillToggle} />
                    <SortableHeader label="Customers"   sortKey="customers"     sort={drillSort} onToggle={drillToggle} />
                  </tr>
                </thead>
                <tbody>
                  {drillSorted.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-4 text-center text-muted-foreground">No products found</td></tr>
                  ) : drillSorted.map((item) => (
                    <tr key={item.item_code} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground truncate max-w-[220px]">{item.item_name}</div>
                        <div className="text-[10px] text-muted-foreground">{item.item_code}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(item.total_tonnes)}</td>
                      <td className="px-3 py-2 text-right text-foreground">{item.qty_bought != null ? fmt.format(item.qty_bought) : "—"}</td>
                      <td className={`px-3 py-2 text-right font-medium ${item.qty_on_hand != null && item.qty_on_hand > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {item.qty_on_hand != null ? fmt.format(item.qty_on_hand) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(item.t3m)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmtT(item.p3m)}</td>
                      <td className="px-3 py-2 text-right"><ChangeCell pct={item.change_pct} /></td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{item.last_sale?.slice(0, 10) ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-medium ${item.days_since > 180 ? "text-red-400" : item.days_since > 90 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {item.days_since}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{item.customers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Main table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[780px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60">
              <SortableHeader label="Group"     sortKey="group_name"       sort={groupSort} onToggle={groupToggle} align="left" className="w-40" />
              <SortableHeader label="Status"    sortKey="status"           sort={groupSort} onToggle={groupToggle} align="left" />
              <SortableHeader label="Total t"   sortKey="total_tonnes"     sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="Recent 3m" sortKey="t3m"              sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="Prior 3m"  sortKey="p3m"              sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="3m Δ"      sortKey="change_pct"       sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="YTD"       sortKey="ytd"              sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="YoY Δ"     sortKey="yoy_pct"          sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="Custs"     sortKey="unique_customers" sort={groupSort} onToggle={groupToggle} />
              <SortableHeader label="Last Sale" sortKey="last_sale"        sort={groupSort} onToggle={groupToggle} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRows cols={10} />
            ) : groupSorted.map((r) => (
              <tr
                key={r.group_code}
                onClick={() => handleSelect(r.group_code)}
                className={`border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/30 ${selected === r.group_code ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground truncate max-w-[140px]">{r.group_name}</div>
                  <div className="text-[10px] text-muted-foreground">{r.group_code}</div>
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2.5 text-right text-foreground">{fmtT(r.total_tonnes)}</td>
                <td className="px-3 py-2.5 text-right text-foreground">{fmtT(r.t3m)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtT(r.p3m)}</td>
                <td className="px-3 py-2.5 text-right"><ChangeCell pct={r.change_pct} /></td>
                <td className="px-3 py-2.5 text-right text-foreground">{fmtT(r.ytd)}</td>
                <td className="px-3 py-2.5 text-right"><ChangeCell pct={r.yoy_pct} /></td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.unique_customers}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.last_sale?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground text-xs">No groups match this filter</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ── Items tab ─────────────────────────────────────────────────────────────────
const ITEM_FILTERS = ["All", "Dead Stock", "Very Slow", "Slow Mover"];

function ItemsTab({ companyNos, saleScope }: { companyNos: string[]; saleScope: string }) {
  const [rows, setRows]   = useState<SlowMovingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("All");
  const [search, setSearch]   = useState("");
  const [selectedItem, setSelectedItem] = useState<SlowMovingItem | null>(null);

  useEffect(() => {
    setLoading(true);
    getSlowMovingItems(companyNos, saleScope)
      .then(setRows)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope]);

  const filtered = useMemo(() => {
    let r = filter === "All" ? rows : rows.filter((x) => x.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        x.item_name.toLowerCase().includes(q) ||
        x.item_code.toLowerCase().includes(q) ||
        x.group_name.toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, filter, search]);

  const { sorted: itemSorted, sort: itemSort, toggle: itemToggle } =
    useSortableData(filtered, { key: "days_since", dir: "desc" });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {ITEM_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f !== "All" && <span className="ml-1.5 opacity-60">{rows.filter((r) => r.status === f).length}</span>}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search item or group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto h-7 px-3 rounded-md border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={() => exportCSV(itemSorted, `slow-moving-items-${new Date().toISOString().slice(0,10)}.csv`)}
          disabled={itemSorted.length === 0}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-40"
        >
          <Download01Icon size={12} />
          Export CSV
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60">
              <SortableHeader label="Item"      sortKey="item_name"    sort={itemSort} onToggle={itemToggle} align="left" />
              <SortableHeader label="Group"     sortKey="group_name"   sort={itemSort} onToggle={itemToggle} align="left" />
              <SortableHeader label="Status"    sortKey="status"       sort={itemSort} onToggle={itemToggle} align="left" />
              <SortableHeader label="Last Sale" sortKey="last_sale"    sort={itemSort} onToggle={itemToggle} />
              <SortableHeader label="Days Ago"  sortKey="days_since"   sort={itemSort} onToggle={itemToggle} />
              <SortableHeader label="YTD t"     sortKey="ytd"          sort={itemSort} onToggle={itemToggle} />
              <SortableHeader label="Total t"   sortKey="total_tonnes" sort={itemSort} onToggle={itemToggle} />
              <SortableHeader label="Custs"     sortKey="customers"    sort={itemSort} onToggle={itemToggle} />
              <th className="px-3 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRows cols={9} />
            ) : itemSorted.slice(0, 200).map((r) => (
              <tr
                key={r.item_code}
                onClick={() => setSelectedItem(r)}
                className="border-b border-border/40 hover:bg-accent/20 transition-colors cursor-pointer group"
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground truncate max-w-[200px] group-hover:text-primary transition-colors">{r.item_name}</div>
                  <div className="text-[10px] text-muted-foreground">{r.item_code}</div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[120px]">{r.group_name}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.last_sale?.slice(0, 10) ?? "—"}</td>
                <td className={`px-3 py-2.5 text-right font-medium ${r.days_since > 180 ? "text-red-400" : r.days_since > 90 ? "text-amber-400" : "text-yellow-400"}`}>
                  {r.days_since}
                </td>
                <td className="px-3 py-2.5 text-right text-foreground">{fmtT(r.ytd)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtT(r.total_tonnes)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.customers}</td>
                <td className="px-3 py-2.5 text-center">
                  <ArrowRight01Icon size={13} className="text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground text-xs">No items match</td></tr>
            )}
            {!loading && filtered.length > 200 && (
              <tr><td colSpan={9} className="px-3 py-2 text-center text-muted-foreground text-xs">Showing 200 of {filtered.length}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selectedItem && (
        <ItemDrilldownModal
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          item={selectedItem}
          companyNos={companyNos}
          saleScope={saleScope}
        />
      )}
    </div>
  );
}

// ── Customers tab ─────────────────────────────────────────────────────────────
const CUST_FILTERS = ["All", "Stopped", "At Risk", "Declining", "Active", "Irregular"];

function CustomersTab({ companyNos, saleScope }: { companyNos: string[]; saleScope: string }) {
  const [rows, setRows]       = useState<CustomerMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("All");
  const [search, setSearch]   = useState("");
  const [expandedCust, setExpandedCust] = useState<string | null>(null);
  const [custGroups, setCustGroups]     = useState<Record<string, CustomerGroupRow[]>>({});
  const [custGroupsLoading, setCustGroupsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    getCustomerMovementAnalytics(companyNos, saleScope)
      .then(setRows)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope]);

  const filtered = useMemo(() => {
    let r = filter === "All" ? rows : rows.filter((x) => x.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        (x.customer_name ?? "").toLowerCase().includes(q) ||
        x.customer_code.toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, filter, search]);

  const { sorted: custSorted, sort: custSort, toggle: custToggle } =
    useSortableData(filtered, { key: "days_since", dir: "desc" });

  const handleCustExpand = async (code: string) => {
    if (expandedCust === code) { setExpandedCust(null); return; }
    setExpandedCust(code);
    if (!custGroups[code]) {
      setCustGroupsLoading((prev) => ({ ...prev, [code]: true }));
      try {
        const groups = await getCustomerGroups(code, companyNos, saleScope);
        setCustGroups((prev) => ({ ...prev, [code]: groups }));
      } finally {
        setCustGroupsLoading((prev) => ({ ...prev, [code]: false }));
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {CUST_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f !== "All" && <span className="ml-1.5 opacity-60">{rows.filter((r) => r.status === f).length}</span>}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto h-7 px-3 rounded-md border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={() => exportCSV(custSorted, `customers-${new Date().toISOString().slice(0,10)}.csv`)}
          disabled={custSorted.length === 0}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-40"
        >
          <Download01Icon size={12} />
          Export CSV
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[780px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60">
              <SortableHeader label="Customer"      sortKey="customer_name"  sort={custSort} onToggle={custToggle} align="left" />
              <SortableHeader label="Status"        sortKey="status"         sort={custSort} onToggle={custToggle} align="left" />
              <SortableHeader label="Last Purchase" sortKey="last_purchase"  sort={custSort} onToggle={custToggle} />
              <SortableHeader label="Days"          sortKey="days_since"     sort={custSort} onToggle={custToggle} />
              <SortableHeader label="Recent 3m"     sortKey="t3m"            sort={custSort} onToggle={custToggle} />
              <SortableHeader label="Prior 3m"      sortKey="p3m"            sort={custSort} onToggle={custToggle} />
              <SortableHeader label="3m Δ"          sortKey="change_pct"     sort={custSort} onToggle={custToggle} />
              <SortableHeader label="Total t"       sortKey="total_tonnes"   sort={custSort} onToggle={custToggle} />
              <SortableHeader label="Top Group"     sortKey="top_group"      sort={custSort} onToggle={custToggle} align="left" />
              <SortableHeader label="Rep"           sortKey="last_rep"       sort={custSort} onToggle={custToggle} align="left" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRows cols={10} />
            ) : custSorted.map((r) => (
              <Fragment key={r.customer_code}>
                <tr
                  onClick={() => handleCustExpand(r.customer_code)}
                  className={`border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/30 ${expandedCust === r.customer_code ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {expandedCust === r.customer_code
                        ? <ArrowDown01Icon size={12} className="text-primary flex-shrink-0" />
                        : <ArrowRight01Icon size={12} className="text-muted-foreground flex-shrink-0" />}
                      <div>
                        <div className="font-medium text-foreground truncate max-w-[145px]">{r.customer_name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.customer_code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{r.last_purchase?.slice(0, 10) ?? "—"}</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${r.days_since > 60 ? "text-red-400" : r.days_since > 30 ? "text-amber-400" : "text-emerald-400"}`}>
                    {r.days_since}
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground">{fmtT(r.t3m)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtT(r.p3m)}</td>
                  <td className="px-3 py-2.5 text-right"><ChangeCell pct={r.change_pct} /></td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtT(r.total_tonnes)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[100px]">{r.top_group ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[90px]">{r.last_rep ?? "—"}</td>
                </tr>
                {expandedCust === r.customer_code && (
                  <tr className="border-b border-primary/20">
                    <td colSpan={10} className="px-0 py-0 bg-primary/3">
                      {custGroupsLoading[r.customer_code] ? (
                        <div className="px-8 py-3 text-xs text-muted-foreground">Loading product groups…</div>
                      ) : (
                        <div className="px-6 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/40">
                                <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Product Group</th>
                                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">Total t</th>
                                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">Recent 3m</th>
                                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">Prior 3m</th>
                                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">3m Δ</th>
                                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">Last Sale</th>
                                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">Products</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(custGroups[r.customer_code] ?? []).length === 0 ? (
                                <tr><td colSpan={7} className="px-2 py-3 text-center text-muted-foreground">No product groups found</td></tr>
                              ) : (custGroups[r.customer_code] ?? []).map((g) => (
                                <tr key={g.group_code} className="border-b border-border/20 hover:bg-accent/10 transition-colors">
                                  <td className="px-2 py-1.5">
                                    <div className="font-medium text-foreground">{g.group_name}</div>
                                    <div className="text-[10px] text-muted-foreground">{g.group_code}</div>
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-foreground">{fmtT(g.total_tonnes)}</td>
                                  <td className="px-2 py-1.5 text-right text-foreground">{fmtT(g.t3m)}</td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtT(g.p3m)}</td>
                                  <td className="px-2 py-1.5 text-right"><ChangeCell pct={g.change_pct} /></td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{g.last_sale?.slice(0, 10) ?? "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{g.items}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground text-xs">No customers match</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ── Stock Status tab ──────────────────────────────────────────────────────────
function StockKpi({ label, value, color = "text-foreground", sub }: {
  label: string; value: string | number; color?: string; sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const fmt2 = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StockTab({ companyNos, saleScope: _saleScope }: { companyNos: string[]; saleScope: string }) {
  const [rows, setRows]       = useState<StockRow[]>([]);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]   = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "instock" | "zero" | "alert">("all");
  const [refreshMsg, setRefreshMsg]   = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getStockStatus(companyNos),
      getStockSummary(companyNos),
    ]).then(([r, s]) => {
      setRows(r);
      setSummary(s);
    }).finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [JSON.stringify(companyNos)]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const result = await triggerStockRefresh(companyNos);
      const total = result.results?.reduce((acc: number, r: any) => acc + (r.records ?? 0), 0) ?? 0;
      setRefreshMsg(`Refreshed — ${total} records`);
      load();
    } catch {
      setRefreshMsg("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (stockFilter === "instock") r = r.filter((x) => x.instock > 0);
    if (stockFilter === "zero")    r = r.filter((x) => x.instock === 0);
    if (stockFilter === "alert")   r = r.filter((x) => x.instock === 0 && x.ord_out > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        x.art_code.toLowerCase().includes(q) ||
        (x.item_name ?? "").toLowerCase().includes(q) ||
        (x.item_group_code ?? "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, stockFilter, search]);

  const { sorted: stockSorted, sort: stockSort, toggle: stockToggle } =
    useSortableData(filtered, { key: "instock", dir: "asc" });

  const stockBand = (row: StockRow) => {
    if (row.instock === 0 && row.ord_out > 0) return "bg-red-500/8 hover:bg-red-500/14";
    if (row.instock > 0 && row.instock < row.ord_out) return "bg-amber-500/8 hover:bg-amber-500/14";
    return "hover:bg-accent/20";
  };

  const instock_color = (row: StockRow) => {
    if (row.instock === 0) return "text-red-400 font-semibold";
    if (row.instock < row.ord_out) return "text-amber-400 font-semibold";
    return "text-emerald-400";
  };

  return (
    <div className="space-y-3">
      {/* KPI row */}
      {summary && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          <StockKpi label="Total Items"       value={fmt2.format(summary.total_items)} />
          <StockKpi label="In Stock"          value={fmt2.format(summary.items_in_stock)} color="text-emerald-400" sub={`${summary.total_items ? Math.round((summary.items_in_stock / summary.total_items) * 100) : 0}% of items`} />
          <StockKpi label="Zero Stock"        value={fmt2.format(summary.items_zero_stock)} color="text-amber-400" />
          <StockKpi label="Stockout + Orders" value={fmt2.format(summary.stockout_with_orders)} color="text-red-400" sub="Selling but empty" />
          <StockKpi label="Total On Hand"     value={fmt2.format(summary.total_instock)} sub="units" />
          <StockKpi label="On Order (out)"    value={fmt2.format(summary.total_ord_out)} sub="customer orders" />
          <StockKpi label="Incoming (PO)"     value={fmt2.format(summary.total_po_qty)} sub="purchase orders" color="text-sky-400" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all",     label: "All" },
          { key: "instock", label: "In Stock" },
          { key: "zero",    label: "Zero Stock" },
          { key: "alert",   label: "⚠ Stockout + Orders" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStockFilter(f.key as typeof stockFilter)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              stockFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search item code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 px-3 rounded-md border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30 text-xs text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <ArrowReloadVerticalIcon size={12} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh from Hansa"}
        </button>
        <button
          onClick={() => exportCSV(stockSorted, `stock-status-${new Date().toISOString().slice(0,10)}.csv`)}
          disabled={stockSorted.length === 0}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-40"
        >
          <Download01Icon size={12} />
          Export CSV
        </button>
        {refreshMsg && <span className="text-[10px] text-muted-foreground">{refreshMsg}</span>}
      </div>

      {/* Last fetched */}
      {summary?.last_fetched_at && (
        <p className="text-[10px] text-muted-foreground">
          Snapshot taken: {new Date(summary.last_fetched_at).toLocaleString("en-AU")}
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="border-b border-border bg-secondary/60">
              <SortableHeader label="Item"       sortKey="item_name"        sort={stockSort} onToggle={stockToggle} align="left" />
              <SortableHeader label="Group"      sortKey="item_group_code"  sort={stockSort} onToggle={stockToggle} align="left" />
              <SortableHeader label="Location"   sortKey="location"         sort={stockSort} onToggle={stockToggle} align="left" />
              <SortableHeader label="In Stock"   sortKey="instock"          sort={stockSort} onToggle={stockToggle} />
              <SortableHeader label="On Order"   sortKey="ord_out"          sort={stockSort} onToggle={stockToggle} />
              <SortableHeader label="PO Qty"     sortKey="po_qty"           sort={stockSort} onToggle={stockToggle} />
              <SortableHeader label="Reserved"   sortKey="rsrv_qty"         sort={stockSort} onToggle={stockToggle} />
              <SortableHeader label="In Transit" sortKey="in_shipment"      sort={stockSort} onToggle={stockToggle} />
              <SortableHeader label="Avg Cost"   sortKey="weighed_av_price" sort={stockSort} onToggle={stockToggle} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRows cols={9} />
            ) : stockSorted.slice(0, 500).map((r, i) => (
              <tr key={`${r.art_code}-${r.location}-${i}`} className={`border-b border-border/40 transition-colors ${stockBand(r)}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground truncate max-w-[200px]">{r.item_name ?? r.art_code}</div>
                  <div className="text-[10px] text-muted-foreground">{r.art_code}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[110px]">{r.item_group_name ?? r.item_group_code ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary border border-border text-muted-foreground">{r.location}</span>
                </td>
                <td className={`px-3 py-2 text-right ${instock_color(r)}`}>{fmt2.format(r.instock)}</td>
                <td className="px-3 py-2 text-right text-foreground">{r.ord_out > 0 ? fmt2.format(r.ord_out) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right text-sky-400">{r.po_qty > 0 ? fmt2.format(r.po_qty) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.rsrv_qty > 0 ? fmt2.format(r.rsrv_qty) : "—"}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.in_shipment > 0 ? fmt2.format(r.in_shipment) : "—"}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{r.weighed_av_price ? fmtMoney.format(r.weighed_av_price) : "—"}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                {rows.length === 0
                  ? <span>No stock data — click <strong>Refresh from Hansa</strong> to load a snapshot</span>
                  : "No items match your filter"}
              </td></tr>
            )}
            {!loading && filtered.length > 500 && (
              <tr><td colSpan={9} className="px-3 py-2 text-center text-muted-foreground text-xs">Showing 500 of {filtered.length} items</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "groups",    label: "Product Groups",    icon: Package01Icon },
  { id: "items",     label: "Slow-Moving Items", icon: Package02Icon },
  { id: "customers", label: "Customers",         icon: UserGroupIcon },
  { id: "stock",     label: "Stock Status",      icon: Building04Icon },
];

export default function Movement() {
  const [tab, setTab] = useState<TabId>("groups");
  const { companyNos, saleScope, companyLabel } = useCompany();
  const [summary, setSummary]           = useState<MovementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    setSummaryLoading(true);
    getMovementSummary(companyNos, saleScope)
      .then(setSummary)
      .finally(() => setSummaryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 border-b border-border px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Movement Analytics</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Product group health, slow movers &amp; customer activity — {companyLabel}
              {summary?.data_as_of && (
                <span className="ml-2 text-primary">· data as of {summary.data_as_of.slice(0, 10)}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* KPI summary */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-border">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <KpiCard label="Growing Groups"  value={summaryLoading ? "…" : summary?.growing_groups ?? 0}   color="text-emerald-400" />
          <KpiCard label="Declining Groups" value={summaryLoading ? "…" : summary?.declining_groups ?? 0} color="text-amber-400" />
          <KpiCard label="Dead Groups"     value={summaryLoading ? "…" : summary?.dead_groups ?? 0}       color="text-red-400" />
          <KpiCard label="Stopped Custs"  value={summaryLoading ? "…" : summary?.stopped_customers ?? 0} sub="No purchase > 60d" color="text-red-400" />
          <KpiCard label="At-Risk Custs"  value={summaryLoading ? "…" : summary?.at_risk_customers ?? 0} sub="No purchase 30–60d" color="text-amber-400" />
          <KpiCard label="Slow Items"      value={summaryLoading ? "…" : summary?.slow_items ?? 0}        sub="> 90d inactive" color="text-amber-400" />
          <KpiCard label="Dead Stock Items" value={summaryLoading ? "…" : summary?.dead_items ?? 0}       sub="> 180d inactive" color="text-red-400" />
          <div className="rounded-lg border border-border bg-card p-3.5 flex flex-col gap-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Legend</p>
            <div className="space-y-2">
              {[
                { status: "Growing",   desc: "↑ 15%+ more volume vs prior 3 months" },
                { status: "Stable",    desc: "Volume within ±15% of prior 3 months" },
                { status: "Declining", desc: "↓ 15%+ less volume vs prior 3 months" },
                { status: "Dead",      desc: "No sales recorded in last 3 months" },
              ].map(({ status, desc }) => (
                <div key={status} className="flex flex-col gap-0.5">
                  <StatusBadge status={status} />
                  <p className="text-[10px] text-muted-foreground pl-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-border px-5 flex gap-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "groups"    && <ProductGroupsTab companyNos={companyNos} saleScope={saleScope} />}
        {tab === "items"     && <ItemsTab         companyNos={companyNos} saleScope={saleScope} />}
        {tab === "customers" && <CustomersTab     companyNos={companyNos} saleScope={saleScope} />}
        {tab === "stock"     && <StockTab         companyNos={companyNos} saleScope={saleScope} />}
      </div>
    </div>
  );
}
