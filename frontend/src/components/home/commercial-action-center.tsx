import { useState, useEffect, useMemo } from "react";
import {
  AlertCircleIcon,
  ChartDownIcon,
  ChartUpIcon,
  UserIcon,
  Package01Icon,
  Calendar01Icon,
  ArrowRight01Icon,
} from "hugeicons-react";
import type { PredictiveInsightsResponse, ReorderWindowEntry } from "@/lib/api";
import { getMissedReorderWindows } from "@/lib/api";
import { useCompany } from "@/lib/company-context";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmtT = (v: number) => `${nf.format(Math.abs(v))} t`;

interface CardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: React.ReactNode;
  count: number | string;
  unit: string;
  impactLine?: string | null;
  trendPct?: number | null;
  trendPositive?: boolean;
  border: string;
  bg: string;
  onViewDetails?: () => void;
}

function ActionCard({
  icon, iconBg, title, count, unit, impactLine, trendPct, trendPositive,
  border, bg, onViewDetails,
}: CardProps) {
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-2.5 min-h-[165px] border ${border} ${bg}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <span className="text-[12px] font-semibold text-foreground leading-tight">{title}</span>
      </div>

      <div className="flex-1">
        <div className="leading-none flex items-baseline gap-1">
          <span className="text-[38px] font-extrabold text-foreground tracking-tight">{count}</span>
          <span className="text-[12px] text-muted-foreground font-medium">{unit}</span>
        </div>
        {impactLine && (
          <div className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{impactLine}</div>
        )}
        {trendPct != null && (
          <div className={`text-[14px] font-bold mt-1 ${trendPositive ? "text-emerald-400" : "text-red-400"}`}>
            {trendPositive ? "▲" : "▼"} {Math.abs(trendPct).toFixed(1)}%
          </div>
        )}
      </div>

      <button
        onClick={onViewDetails}
        className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors self-start font-medium"
      >
        View details <ArrowRight01Icon size={10} />
      </button>
    </div>
  );
}

function MissedReorderCard() {
  const { companyNos, saleScope } = useCompany();
  const [data, setData] = useState<ReorderWindowEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMissedReorderWindows(companyNos, saleScope)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), saleScope]);

  const volumeAtRisk = useMemo(
    () => (data ?? []).reduce((s, r) => s + r.usual_volume, 0),
    [data]
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-blue-800/50 bg-blue-950/20 p-4 animate-pulse min-h-[165px]">
        <div className="h-9 w-9 rounded-lg bg-blue-500/15 mb-2.5" />
        <div className="h-3 w-28 bg-muted/50 rounded mb-2" />
        <div className="h-8 w-16 bg-muted/60 rounded" />
      </div>
    );
  }

  return (
    <ActionCard
      icon={<Calendar01Icon size={18} className="text-blue-400" />}
      iconBg="bg-blue-500/15"
      title={<>Missed Reorder<br />Windows</>}
      count={data?.length ?? 0}
      unit="customers"
      impactLine={volumeAtRisk > 0 ? `${fmtT(volumeAtRisk)} at risk` : "No volume at risk"}
      trendPct={null}
      border="border-blue-800/50"
      bg="bg-blue-950/20"
    />
  );
}

export interface CommercialActionCenterProps {
  predictive: PredictiveInsightsResponse | null;
  loading: boolean;
  onSelectCustomer?: (c: PredictiveInsightsResponse["customer_lapse_risk"][0]) => void;
  comparisonLabel?: string;
}

export default function CommercialActionCenter({
  predictive,
  loading,
  comparisonLabel = "LY MTD",
}: CommercialActionCenterProps) {
  if (loading || !predictive) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-4 w-52 bg-muted/50 rounded animate-pulse" />
            <div className="h-3 w-72 bg-muted/35 rounded animate-pulse" />
          </div>
          <div className="h-7 w-24 bg-muted/35 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-[165px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const atRisk = predictive.customer_lapse_risk;
  const productsToPush = predictive.products_to_push;
  const allGroups = predictive.product_group_trends;

  const decliningGroups = allGroups.filter(g => g.trend === "declining" || g.trend === "stopped");
  const growingGroups = allGroups.filter(g => g.trend === "growing" || g.trend === "new");

  const dormant = atRisk.filter(c => (c.days_since_purchase ?? 0) >= 20)
    .sort((a, b) => b.tonnes_6m_prior - a.tonnes_6m_prior);

  const atRiskVolume = atRisk.reduce((s, c) => s + c.tonnes_6m_prior, 0) / 2;
  const atRiskAvgPct = atRisk.length > 0
    ? atRisk.reduce((s, c) => s + (c.tonnes_6m_prior > 0 ? 50 : 0), 0) / atRisk.length
    : 0;

  const productLost = productsToPush.reduce((s, p) => s + Math.max(p.prior_3m_tonnes - p.recent_3m_tonnes, 0), 0);
  const productAvgPct = productsToPush.length > 0
    ? Math.abs(productsToPush.reduce((s, p) => s + (p.pct_change ?? 0), 0) / productsToPush.length)
    : 0;

  const decliningLost = decliningGroups.reduce((s, g) => s + Math.max(g.prior_3m_tonnes - g.current_3m_tonnes, 0), 0);
  const decliningAvgPct = decliningGroups.length > 0
    ? Math.abs(decliningGroups.reduce((s, g) => s + (g.pct_change ?? 0), 0) / decliningGroups.length)
    : 0;

  const dormantVolume = dormant.reduce((s, c) => s + c.tonnes_6m_prior, 0) / 2;

  const growingGained = growingGroups.reduce((s, g) => s + Math.max(g.current_3m_tonnes - g.prior_3m_tonnes, 0), 0);
  const growingAvgPct = growingGroups.length > 0
    ? growingGroups.reduce((s, g) => s + (g.pct_change ?? 0), 0) / growingGroups.length
    : 0;

  const cmpLabel = comparisonLabel;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Commercial Action Center</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Key areas that need your attention</p>
        </div>
        <button className="flex-shrink-0 flex items-center gap-1 text-[12px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
          View all <ArrowRight01Icon size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">

        {/* 1. At-Risk Customers */}
        <ActionCard
          icon={<AlertCircleIcon size={18} className="text-red-400" />}
          iconBg="bg-red-500/15"
          title={<>At-Risk<br />Customers</>}
          count={atRisk.length}
          unit="customers"
          impactLine={atRiskVolume > 0 ? `-${fmtT(atRiskVolume)} vs ${cmpLabel}` : "No volume data"}
          trendPct={atRiskAvgPct > 0 ? atRiskAvgPct : null}
          trendPositive={false}
          border="border-red-800/50"
          bg="bg-red-950/20"
        />

        {/* 2. Products to Push */}
        <ActionCard
          icon={<Package01Icon size={18} className="text-amber-400" />}
          iconBg="bg-amber-500/15"
          title={<>Products to<br />Push</>}
          count={productsToPush.length}
          unit="products"
          impactLine={productLost > 0 ? `-${fmtT(productLost)} vs ${cmpLabel}` : "No lost volume"}
          trendPct={productAvgPct > 0 ? productAvgPct : null}
          trendPositive={false}
          border="border-amber-800/50"
          bg="bg-amber-950/20"
        />

        {/* 3. Declining Groups */}
        <ActionCard
          icon={<ChartDownIcon size={18} className="text-rose-400" />}
          iconBg="bg-rose-500/15"
          title={<>Declining<br />Groups</>}
          count={decliningGroups.length}
          unit="groups"
          impactLine={decliningLost > 0 ? `-${fmtT(decliningLost)} vs ${cmpLabel}` : "No lost volume"}
          trendPct={decliningAvgPct > 0 ? decliningAvgPct : null}
          trendPositive={false}
          border="border-rose-800/50"
          bg="bg-rose-950/20"
        />

        {/* 4. Dormant High-Value */}
        <ActionCard
          icon={<UserIcon size={18} className="text-violet-400" />}
          iconBg="bg-violet-500/15"
          title={<>Dormant<br />High-Value</>}
          count={dormant.length}
          unit="customers"
          impactLine={dormantVolume > 0 ? `-${fmtT(dormantVolume)} at risk` : "No volume at risk"}
          trendPct={null}
          border="border-violet-800/50"
          bg="bg-violet-950/20"
        />

        {/* 5. Missed Reorder Windows */}
        <MissedReorderCard />

        {/* 6. Growing Groups */}
        <ActionCard
          icon={<ChartUpIcon size={18} className="text-emerald-400" />}
          iconBg="bg-emerald-500/15"
          title={<>Growing<br />Groups</>}
          count={growingGroups.length}
          unit="groups"
          impactLine={growingGained > 0 ? `+${fmtT(growingGained)} vs ${cmpLabel}` : "No gained volume"}
          trendPct={growingAvgPct > 0 ? growingAvgPct : null}
          trendPositive={true}
          border="border-emerald-800/50"
          bg="bg-emerald-950/20"
        />

      </div>
    </div>
  );
}
