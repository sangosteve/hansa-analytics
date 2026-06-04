import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCustomerHistory,
  type CustomerHistoryResponse,
} from "@/lib/api";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmtT = (v: number | null | undefined) =>
  v == null ? "—" : `${fmt.format(v)} t`;
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

function ChangeCell({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const isUp = pct > 0;
  const flat = Math.abs(pct) < 3;
  return (
    <span className={`font-medium ${flat ? "text-muted-foreground" : isUp ? "text-emerald-400" : "text-red-400"}`}>
      {fmtPct(pct)}
    </span>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  customerCode: string;
  customerName: string | null;
  revenueTier: string;
  tonnes6mPrior: number;
  lastPurchaseDate: string | null;
  daysSince: number | null;
  companyNos: string[];
  saleScope: string;
};

export function CustomerDrilldownModal({
  open, onClose,
  customerCode, customerName, revenueTier,
  tonnes6mPrior, lastPurchaseDate, daysSince,
  companyNos, saleScope,
}: Props) {
  const [data, setData] = useState<CustomerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"groups" | "items">("groups");

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    setLoading(true);
    setTab("groups");
    getCustomerHistory(customerCode, companyNos, saleScope)
      .then(setData)
      .catch(() => setError("Failed to load purchase history"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerCode, JSON.stringify(companyNos), saleScope]);

  const tierColor =
    revenueTier === "high"   ? "bg-red-500/20 text-red-400" :
    revenueTier === "medium" ? "bg-amber-500/20 text-amber-400" :
                               "bg-muted text-muted-foreground";

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
              { offset: 0, color: "#818cf8" },
              { offset: 1, color: "#818cf840" },
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
            <span className="truncate">{customerName || customerCode}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${tierColor}`}>
              {revenueTier}
            </span>
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground font-normal">{customerCode}</p>
        </DialogHeader>

        {/* Stat strip */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Prior 6m tonnes", value: fmtT(tonnes6mPrior) },
            { label: "Last purchase",   value: lastPurchaseDate?.slice(0, 10) ?? "—" },
            { label: "Days inactive",   value: daysSince != null ? `${daysSince}d` : "—",
              color: daysSince != null && daysSince > 90 ? "text-red-400" : daysSince != null && daysSince > 60 ? "text-amber-400" : "text-foreground" },
            { label: "Active months",   value: data ? `${data.active_months} mo` : "…" },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-secondary/50 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground/70 mb-0.5">{s.label}</p>
              <p className={`text-sm font-semibold ${s.color ?? "text-foreground"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Monthly chart */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55 mb-2">
            Purchase History
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
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-xs">No data</div>
          )}
        </div>

        {/* Tabs */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/55">
              Breakdown
            </p>
            <div className="flex rounded-md border border-border overflow-hidden text-[10px] ml-auto">
              <button
                onClick={() => setTab("groups")}
                className={`px-2.5 py-1 transition-colors ${tab === "groups" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                By Product Group
              </button>
              <button
                onClick={() => setTab("items")}
                className={`px-2.5 py-1 border-l border-border transition-colors ${tab === "items" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Top Items
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : tab === "groups" ? (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/60">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Product Group</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total t</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Recent 3m</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Prior 3m</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">3m Δ</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Last Sale</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {!data?.by_group.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-5 text-center text-muted-foreground">No product group data</td>
                    </tr>
                  ) : data.by_group.map((g) => (
                    <tr key={g.group_code} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground truncate max-w-[180px]">{g.group_name}</div>
                        <div className="text-[10px] text-muted-foreground">{g.group_code}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(g.total_tonnes)}</td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(g.t3m)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmtT(g.p3m)}</td>
                      <td className="px-3 py-2 text-right"><ChangeCell pct={g.change_pct} /></td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{g.last_sale?.slice(0, 10) ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{g.items}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/60">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Group</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total t</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Last Sale</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Days Ago</th>
                  </tr>
                </thead>
                <tbody>
                  {!data?.top_items.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">No item data</td>
                    </tr>
                  ) : data.top_items.map((item) => (
                    <tr key={item.item_code} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground truncate max-w-[200px]">{item.item_name}</div>
                        <div className="text-[10px] text-muted-foreground">{item.item_code}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{item.group_name}</td>
                      <td className="px-3 py-2 text-right text-foreground">{fmtT(item.total_tonnes)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{item.last_sale?.slice(0, 10) ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-medium ${
                        item.days_since != null && item.days_since > 90 ? "text-red-400" :
                        item.days_since != null && item.days_since > 44 ? "text-amber-400" :
                        "text-muted-foreground"
                      }`}>
                        {item.days_since != null ? `${item.days_since}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer summary */}
        {data && (
          <p className="text-[10px] text-muted-foreground text-right">
            All-time total: <span className="text-foreground font-medium">{fmtT(data.total_tonnes)}</span>
            {data.first_purchase && (
              <> · First purchase: <span className="text-foreground font-medium">{data.first_purchase.slice(0, 10)}</span></>
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
