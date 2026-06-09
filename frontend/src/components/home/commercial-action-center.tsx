import { useState, useEffect, useMemo } from "react";
import {
  AlertCircleIcon,
  ChartDownIcon,
  ChartUpIcon,
  UserIcon,
  Package01Icon,
  Clock01Icon,
  ArrowRight01Icon,
} from "hugeicons-react";
import type { PredictiveInsightsResponse, ReorderWindowEntry } from "@/lib/api";
import { getMissedReorderWindows } from "@/lib/api";
import { useCompany } from "@/lib/company-context";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmtT = (v: number) => `${nf.format(Math.abs(v))} t`;

function CompactCard({
  icon,
  iconBg,
  title,
  countLine,
  impactLine,
  trendLine,
  trendPositive,
  onViewDetails,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  countLine: string;
  impactLine?: string | null;
  trendLine?: string | null;
  trendPositive?: boolean;
  onViewDetails?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2.5 min-h-[148px]">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <span className="text-[11px] font-semibold text-foreground leading-tight">{title}</span>
      </div>

      <div className="flex-1">
        <div className="text-[20px] font-extrabold text-foreground leading-none mt-0.5">
          {countLine}
        </div>
        {impactLine && (
          <div className="text-[11px] text-muted-foreground mt-1.5 leading-tight">
            {impactLine}
          </div>
        )}
        {trendLine && (
          <div className={`text-[13px] font-bold mt-0.5 leading-tight ${
            trendPositive ? "text-emerald-400" : "text-red-400"
          }`}>
            {trendLine}
          </div>
        )}
      </div>

      <button
        onClick={onViewDetails}
        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors self-start"
      >
        View details <ArrowRight01Icon size={10} />
      </button>
    </div>
  );
}

function MissedReorderCompactCard() {
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

  const usualVolumeAtRisk = useMemo(
    () => (data ?? []).reduce((s, r) => s + r.usual_volume, 0),
    [data]
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse min-h-[148px]">
        <div className="h-8 w-8 rounded-lg bg-muted/60 mb-2.5" />
        <div className="h-3 w-28 bg-muted/50 rounded mb-2" />
        <div className="h-5 w-16 bg-muted/60 rounded" />
      </div>
    );
  }

  return (
    <CompactCard
      icon={<Clock01Icon size={15} className="text-orange-400" />}
      iconBg="bg-orange-500/10 border border-orange-500/20"
      title="Missed Reorder Windows"
      countLine={`${data?.length ?? 0} customers`}
      impactLine={usualVolumeAtRisk > 0 ? `${fmtT(usualVolumeAtRisk)} at risk` : "No volume at risk"}
      trendLine={null}
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
          <div className="h-7 w-28 bg-muted/35 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-[148px] animate-pulse" />
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
          <h2 className="text-[13px] font-semibold text-foreground">Commercial Action Center</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Key areas that need your attention</p>
        </div>
        <button className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary border border-border/60 hover:border-primary/40 px-3 py-1.5 rounded-lg transition-colors">
          View all <ArrowRight01Icon size={11} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">

        {/* 1. At-Risk Customers */}
        <CompactCard
          icon={<AlertCircleIcon size={15} className="text-red-400" />}
          iconBg="bg-red-500/10 border border-red-500/20"
          title="At-Risk Customers"
          countLine={`${atRisk.length} customers`}
          impactLine={atRiskVolume > 0 ? `-${fmtT(atRiskVolume)} vs ${cmpLabel}` : "No volume data"}
          trendLine={atRiskAvgPct > 0 ? `▼ ${atRiskAvgPct.toFixed(1)}%` : null}
          trendPositive={false}
        />

        {/* 2. Products to Push */}
        <CompactCard
          icon={<Package01Icon size={15} className="text-blue-400" />}
          iconBg="bg-blue-500/10 border border-blue-500/20"
          title="Products to Push"
          countLine={`${productsToPush.length} products`}
          impactLine={productLost > 0 ? `-${fmtT(productLost)} vs ${cmpLabel}` : "No lost volume"}
          trendLine={productAvgPct > 0 ? `▼ ${productAvgPct.toFixed(1)}%` : null}
          trendPositive={false}
        />

        {/* 3. Declining Groups */}
        <CompactCard
          icon={<ChartDownIcon size={15} className="text-red-400" />}
          iconBg="bg-red-500/10 border border-red-500/20"
          title="Declining Groups"
          countLine={`${decliningGroups.length} groups`}
          impactLine={decliningLost > 0 ? `-${fmtT(decliningLost)} vs ${cmpLabel}` : "No lost volume"}
          trendLine={decliningAvgPct > 0 ? `▼ ${decliningAvgPct.toFixed(1)}%` : null}
          trendPositive={false}
        />

        {/* 4. Dormant High-Value */}
        <CompactCard
          icon={<UserIcon size={15} className="text-amber-400" />}
          iconBg="bg-amber-500/10 border border-amber-500/20"
          title="Dormant High-Value"
          countLine={`${dormant.length} customers`}
          impactLine={dormantVolume > 0 ? `-${fmtT(dormantVolume)} at risk` : "No volume at risk"}
          trendLine={null}
        />

        {/* 5. Missed Reorder Windows */}
        <MissedReorderCompactCard />

        {/* 6. Growing Groups */}
        <CompactCard
          icon={<ChartUpIcon size={15} className="text-emerald-400" />}
          iconBg="bg-emerald-500/10 border border-emerald-500/20"
          title="Growing Groups"
          countLine={`${growingGroups.length} groups`}
          impactLine={growingGained > 0 ? `+${fmtT(growingGained)} vs ${cmpLabel}` : "No gained volume"}
          trendLine={growingAvgPct > 0 ? `▲ ${growingAvgPct.toFixed(1)}%` : null}
          trendPositive={true}
        />

      </div>
    </div>
  );
}
