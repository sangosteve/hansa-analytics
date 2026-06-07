import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getItemHistory,
  type ItemHistoryResponse,
  type SlowMovingItem,
} from "@/lib/api";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmtT = (v: number | null | undefined) =>
  v == null ? "—" : `${fmt.format(v)} t`;

const STATUS_BADGE: Record<string, string> = {
  "Dead Stock": "bg-red-500/20 text-red-400",
  "Very Slow":  "bg-amber-500/20 text-amber-400",
  "Slow Mover": "bg-yellow-500/20 text-yellow-400",
};

type Props = {
  open: boolean;
  onClose: () => void;
  item: SlowMovingItem;
  companyNos: string[];
  saleScope: string;
};

export function ItemDrilldownModal({ open, onClose, item, companyNos, saleScope }: Props) {
  const [data, setData] = useState<ItemHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    setLoading(true);
    getItemHistory(item.item_code, companyNos, saleScope)
      .then(setData)
      .catch(() => setError("Failed to load item history"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.item_code, JSON.stringify(companyNos), saleScope]);

  const badgeClass = STATUS_BADGE[item.status] ?? "bg-muted text-muted-foreground";

  const chartOption = useMemo(() => {
    if (!data?.monthly.length) return null;
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
      grid: { left: "8%", right: "4%", top: "10%", bottom: "14%" },
      xAxis: {
        type: "category",
        data: data.monthly.map((d) => d.month.slice(0, 7)),
        axisLine: { lineStyle: { color: "#30363d" } },
        axisLabel: { color: "#8b949e", rotate: 30, fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Tonnes",
        nameTextStyle: { color: "#8b949e", fontSize: 10 },
        axisLabel: { color: "#8b949e" },
        splitLine: { lineStyle: { color: "#21262d" } },
      },
      series: [{
        name: "Tonnes",
        type: "bar",
        data: data.monthly.map((d) => d.tonnes),
        itemStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "#f97316" },
              { offset: 1, color: "#f9731630" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
        },
      }],
    };
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{item.item_name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${badgeClass}`}>
              {item.status}
            </span>
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground font-normal">
            {item.item_code} · {item.group_name}
          </p>
        </DialogHeader>

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Total tonnes",  value: fmtT(item.total_tonnes) },
            { label: "YTD tonnes",    value: fmtT(item.ytd) },
            { label: "Last sale",     value: item.last_sale?.slice(0, 10) ?? "—" },
            {
              label: "Days inactive",
              value: `${item.days_since}d`,
              color: item.days_since > 180 ? "text-red-400" : item.days_since > 90 ? "text-amber-400" : "text-foreground",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-secondary/50 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground/70 mb-0.5">{s.label}</p>
              <p className={`text-sm font-semibold ${s.color ?? "text-foreground"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Summary stats (from API) */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: "Unique customers", value: data.unique_customers },
              { label: "First sale",       value: data.first_sale?.slice(0, 10) ?? "—" },
              { label: "All-time tonnes",  value: fmtT(data.total_tonnes) },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-border bg-secondary/30 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground/70 mb-0.5">{s.label}</p>
                <p className="text-sm font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Monthly chart */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55 mb-2">
            Sales History (last 24 months)
          </p>
          {loading ? (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-xs gap-2">
              <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="h-[160px] flex items-center justify-center text-red-400 text-xs">{error}</div>
          ) : chartOption ? (
            <ReactECharts option={chartOption} style={{ height: 160 }} notMerge lazyUpdate />
          ) : (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-xs">No sales data found</div>
          )}
        </div>

        {/* Top customers */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55 mb-2">
            Top Customers
          </p>
          {loading ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
          ) : !data?.top_customers.length ? (
            <div className="py-4 text-center text-xs text-muted-foreground">No customer data</div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/60">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Customer</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total t</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Recent 3m</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Last Purchase</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Days Ago</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_customers.map((c) => (
                    <tr key={c.customer_code} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground truncate max-w-[200px]">{c.customer_name}</div>
                        <div className="text-[10px] text-muted-foreground">{c.customer_code}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(c.total_tonnes)}</td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(c.t3m)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{c.last_purchase?.slice(0, 10) ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-medium ${
                        c.days_since != null && c.days_since > 180 ? "text-red-400" :
                        c.days_since != null && c.days_since > 90 ? "text-amber-400" :
                        "text-muted-foreground"
                      }`}>
                        {c.days_since != null ? `${c.days_since}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
