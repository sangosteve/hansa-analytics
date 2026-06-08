import {
  AlertCircleIcon,
  ChartDownIcon,
  ChartUpIcon,
  UserIcon,
  Package01Icon,
  FlashIcon,
  ArrowRight01Icon,
} from "hugeicons-react";
import type { PredictiveInsightsResponse } from "@/lib/api";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtT = (v: number) => `${nf.format(Math.abs(v))} t`;

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 56, h = 22;
  const max = Math.max(...values, 0.01);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: 2 + (i / (values.length - 1)) * (w - 4),
    y: (h - 3) - ((v - min) / range) * (h - 6),
  }));
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M ${pts[0].x},${h - 2} ` +
    pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L ${pts[pts.length - 1].x},${h - 2} Z`;
  const gradId = `cac-grad-${color.replace("#", "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline points={line} stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RiskBadge({ tier }: { tier: "high" | "medium" | "low" }) {
  const styles: Record<string, string> = {
    high: "bg-red-500/15 text-red-400 border-red-500/25",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    low: "bg-slate-500/15 text-slate-400 border-slate-500/25",
  };
  const labels: Record<string, string> = { high: "High Risk", medium: "Med Risk", low: "Low Risk" };
  return (
    <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${styles[tier]}`}>
      {labels[tier]}
    </span>
  );
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">
      {children}
    </div>
  );
}

function ActionCard({
  icon,
  iconBg,
  title,
  subtitle,
  children,
  footer,
  cta,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  cta?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col min-h-0">
      <div className="px-3.5 pt-3 pb-2.5 flex items-start justify-between gap-2 border-b border-border/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-foreground leading-tight">{title}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{subtitle}</p>
          </div>
        </div>
        <button className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors whitespace-nowrap flex-shrink-0 mt-0.5">
          View all <ArrowRight01Icon size={10} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>

      {(footer || cta) && (
        <div className="px-3.5 py-2 border-t border-border/50 flex items-center justify-between gap-2">
          {footer && <span className="text-[9.5px] text-muted-foreground/70 leading-tight">{footer}</span>}
          {cta && (
            <button className="flex-shrink-0 text-[10px] font-medium text-primary bg-primary/8 hover:bg-primary/15 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1">
              {cta} <ArrowRight01Icon size={9} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface CommercialActionCenterProps {
  predictive: PredictiveInsightsResponse | null;
  loading: boolean;
  onSelectCustomer?: (c: PredictiveInsightsResponse["customer_lapse_risk"][0]) => void;
}

export default function CommercialActionCenter({
  predictive,
  loading,
  onSelectCustomer,
}: CommercialActionCenterProps) {
  if (loading || !predictive) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-4 w-52 bg-muted/50 rounded animate-pulse" />
            <div className="h-3 w-72 bg-muted/35 rounded animate-pulse" />
          </div>
          <div className="h-7 w-36 bg-muted/35 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-60 animate-pulse" />
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
  const dormant = [...atRisk]
    .filter(c => (c.days_since_purchase ?? 0) >= 20)
    .sort((a, b) => b.tonnes_6m_prior - a.tonnes_6m_prior);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Commercial Action Center</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Key risks, recovery opportunities, and growth drivers
          </p>
        </div>
        <button className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary border border-border/60 hover:border-primary/40 px-3 py-1.5 rounded-lg transition-colors">
          View all insights <ArrowRight01Icon size={11} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">

        {/* ── 1. At-Risk Customers ── */}
        <ActionCard
          icon={<AlertCircleIcon size={14} className="text-red-400" />}
          iconBg="bg-red-500/10 border border-red-500/20"
          title="At-Risk Customers"
          subtitle={`${atRisk.length} accounts need attention`}
          footer={`${atRisk.length} total at risk`}
          cta="View all"
        >
          {atRisk.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center">No at-risk customers</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5">
                <ColHeader>Customer</ColHeader>
                <ColHeader>Risk</ColHeader>
                <ColHeader>Chg</ColHeader>
                <ColHeader>Vol. at Risk</ColHeader>
              </div>
              {atRisk.slice(0, 5).map(c => (
                <button
                  key={c.customer_code}
                  onClick={() => onSelectCustomer?.(c)}
                  className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5 border-t border-border/40 hover:bg-accent/20 transition-colors items-center text-left group"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {c.customer_name || c.customer_code}
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 leading-tight">
                      {c.days_since_purchase != null ? `Last order: ${c.days_since_purchase} days ago` : "No recent order"}
                    </div>
                  </div>
                  <RiskBadge tier={c.revenue_tier} />
                  <span className="text-[10px] text-red-400 font-semibold">↓</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap text-right">
                    {fmtT(c.tonnes_6m_prior)}
                  </span>
                </button>
              ))}
            </>
          )}
        </ActionCard>

        {/* ── 2. Products to Push ── */}
        <ActionCard
          icon={<Package01Icon size={14} className="text-blue-400" />}
          iconBg="bg-blue-500/10 border border-blue-500/20"
          title="Products to Push"
          subtitle={`${productsToPush.length} products with major decline`}
          footer="Opportunity = volume lost vs LY"
          cta="View push list"
        >
          {productsToPush.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center">No declining products</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-3.5 py-1.5">
                <ColHeader>Product</ColHeader>
                <ColHeader>Change vs LY</ColHeader>
                <ColHeader>Opportunity</ColHeader>
              </div>
              {productsToPush.slice(0, 5).map(p => {
                const opportunity = Math.max(p.prior_3m_tonnes - p.recent_3m_tonnes, 0);
                return (
                  <div key={p.item_code} className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-3.5 py-1.5 border-t border-border/40 items-center">
                    <div className="text-[11px] font-medium text-foreground truncate">
                      {p.item_name || p.item_code}
                    </div>
                    <span className="text-[10px] text-red-400 font-semibold whitespace-nowrap">
                      {p.pct_change != null ? `↓ ${Math.abs(p.pct_change).toFixed(1)}%` : "—"}
                    </span>
                    <span className="text-[10px] text-amber-400 font-medium whitespace-nowrap text-right">
                      {fmtT(opportunity)}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </ActionCard>

        {/* ── 3. Declining Groups ── */}
        <ActionCard
          icon={<ChartDownIcon size={14} className="text-red-400" />}
          iconBg="bg-red-500/10 border border-red-500/20"
          title="Declining Groups"
          subtitle={`${decliningGroups.length} of ${allGroups.length} groups declining`}
          cta="View declining groups"
        >
          {decliningGroups.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center">No declining groups</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5">
                <ColHeader>Group</ColHeader>
                <ColHeader>Change vs LY</ColHeader>
                <ColHeader>Vol. Lost</ColHeader>
                <ColHeader>Trend</ColHeader>
              </div>
              {decliningGroups.slice(0, 5).map(g => {
                const lost = Math.max(g.prior_3m_tonnes - g.current_3m_tonnes, 0);
                return (
                  <div key={g.code} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5 border-t border-border/40 items-center">
                    <div className="text-[11px] font-medium text-foreground truncate">{g.name || g.code}</div>
                    <span className="text-[10px] text-red-400 font-semibold whitespace-nowrap">
                      {g.pct_change != null ? `↓ ${Math.abs(g.pct_change).toFixed(1)}%` : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap text-right">
                      {fmtT(lost)}
                    </span>
                    <MiniSparkline values={[g.prior_3m_tonnes, g.current_3m_tonnes]} color="#f87171" />
                  </div>
                );
              })}
            </>
          )}
        </ActionCard>

        {/* ── 4. Dormant High-Value Customers ── */}
        <ActionCard
          icon={<UserIcon size={14} className="text-amber-400" />}
          iconBg="bg-amber-500/10 border border-amber-500/20"
          title="Dormant High-Value Customers"
          subtitle={`${dormant.length} accounts inactive`}
          footer="Based on customers with no orders in selected period"
          cta="Reactivate customers"
        >
          {dormant.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center">No dormant accounts</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5">
                <ColHeader>Customer</ColHeader>
                <ColHeader>Last Order</ColHeader>
                <ColHeader>Prev. Vol.</ColHeader>
                <ColHeader>Days</ColHeader>
              </div>
              {dormant.slice(0, 5).map(c => (
                <button
                  key={c.customer_code}
                  onClick={() => onSelectCustomer?.(c)}
                  className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5 border-t border-border/40 hover:bg-accent/20 transition-colors items-center text-left group"
                >
                  <div className="text-[11px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {c.customer_name || c.customer_code}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {c.days_since_purchase != null ? `${c.days_since_purchase}d ago` : "—"}
                  </span>
                  <span className="text-[10px] text-foreground whitespace-nowrap text-right">
                    {fmtT(c.tonnes_6m_prior)}
                  </span>
                  <span className={`text-[10px] font-bold whitespace-nowrap text-right ${
                    (c.days_since_purchase ?? 0) > 45 ? "text-red-400" :
                    (c.days_since_purchase ?? 0) > 30 ? "text-amber-400" :
                    "text-muted-foreground"
                  }`}>
                    {c.days_since_purchase ?? "—"}
                  </span>
                </button>
              ))}
            </>
          )}
        </ActionCard>

        {/* ── 5. Cross-Sell Opportunities ── */}
        <ActionCard
          icon={<FlashIcon size={14} className="text-purple-400" />}
          iconBg="bg-purple-500/10 border border-purple-500/20"
          title="Cross-Sell Opportunities"
          subtitle="AI-matched buying patterns"
          footer="AI matched based on buying patterns"
          cta="View opportunities"
        >
          <div className="flex flex-col items-center justify-center py-6 px-4 gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <FlashIcon size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-foreground">AI Analysis Required</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Use the AI Assistant to discover cross-sell opportunities based on customer buying patterns.
              </p>
            </div>
            <span className="text-[10px] font-medium px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Ask the AI Assistant →
            </span>
          </div>
        </ActionCard>

        {/* ── 6. Growing Groups ── */}
        <ActionCard
          icon={<ChartUpIcon size={14} className="text-emerald-400" />}
          iconBg="bg-emerald-500/10 border border-emerald-500/20"
          title="Growing Groups"
          subtitle={`${growingGroups.length} of ${allGroups.length} groups growing`}
          footer={`${growingGroups.length} of ${allGroups.length} groups growing`}
          cta="View all growing groups"
        >
          {growingGroups.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-6 text-center">No growing groups</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5">
                <ColHeader>Group</ColHeader>
                <ColHeader>Change vs LY</ColHeader>
                <ColHeader>Current Vol.</ColHeader>
                <ColHeader>Trend</ColHeader>
              </div>
              {growingGroups.slice(0, 5).map(g => (
                <div key={g.code} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3.5 py-1.5 border-t border-border/40 items-center">
                  <div className="text-[11px] font-medium text-foreground truncate">{g.name || g.code}</div>
                  <span className="text-[10px] text-emerald-400 font-semibold whitespace-nowrap">
                    {g.pct_change != null ? `↑ ${Math.abs(g.pct_change).toFixed(1)}%` : "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap text-right">
                    {fmtT(g.current_3m_tonnes)}
                  </span>
                  <MiniSparkline values={[g.prior_3m_tonnes, g.current_3m_tonnes]} color="#34d399" />
                </div>
              ))}
            </>
          )}
        </ActionCard>

      </div>
    </div>
  );
}
