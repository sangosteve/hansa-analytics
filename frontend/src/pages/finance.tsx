import { useEffect, useState } from "react";
import {
  ChartUpIcon,
  ChartDownIcon,
  MoneyReceive02Icon,
  Invoice01Icon,
  Analytics01Icon,
  Store01Icon,
  ProfitIcon,
  InformationCircleIcon,
} from "hugeicons-react";
import { getPLSummary, type PLSummaryResponse } from "@/lib/api";
import { useCompany } from "@/lib/company-context";

// ── Formatting helpers ───────────────────────────────────────────────────────

const fullFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return fullFormatter.format(value);
}

function formatFull(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return fullFormatter.format(value);
}

function YoYBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        positive ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {positive ? <ChartUpIcon size={11} /> : <ChartDownIcon size={11} />}
      {positive ? "+" : ""}
      {pct.toFixed(1)}% vs LY
    </span>
  );
}

// ── P&L Card ────────────────────────────────────────────────────────────────

type PLCardProps = {
  title: string;
  subtitle?: string;
  value: number | null | undefined;
  valueLY?: number | null;
  yoyPct?: number | null;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentClass: string;
  glRequired?: boolean;
  invoiceCount?: number;
};

function PLCard({
  title,
  subtitle,
  value,
  valueLY,
  yoyPct,
  icon: Icon,
  accentClass,
  glRequired,
  invoiceCount,
}: PLCardProps) {
  const hasValue = value !== null && value !== undefined;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex flex-col gap-2 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${accentClass}`}>
            <Icon size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground/60 truncate">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      {/* Value */}
      <div className="flex-1">
        {glRequired && !hasValue ? (
          <div className="flex items-center gap-1.5 py-1">
            <InformationCircleIcon size={14} className="text-muted-foreground/40 flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground/50 italic">
              Awaiting GL sync
            </span>
          </div>
        ) : (
          <p
            className="text-2xl font-bold text-foreground tabular-nums leading-tight"
            title={hasValue ? formatFull(value) : undefined}
          >
            {formatCompact(value)}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--card-border)]">
        {valueLY !== undefined && valueLY !== null ? (
          <span className="text-[10px] text-muted-foreground/60">
            LY: {formatCompact(valueLY)}
          </span>
        ) : glRequired ? (
          <span className="text-[10px] text-muted-foreground/40">
            GL vouchers required
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">
            {invoiceCount !== undefined ? `${invoiceCount.toLocaleString()} invoices` : ""}
          </span>
        )}
        {yoyPct !== undefined && <YoYBadge pct={yoyPct} />}
      </div>
    </div>
  );
}

// ── Skeleton card ────────────────────────────────────────────────────────────

function PLCardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-muted/40" />
        <div className="h-3 w-24 rounded bg-muted/40" />
      </div>
      <div className="h-7 w-32 rounded bg-muted/40" />
      <div className="h-3 w-20 rounded bg-muted/30" />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Finance() {
  const { companyNos, companyLabel, dateFrom, dateTo } = useCompany();
  const [data, setData] = useState<PLSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPLSummary(dateFrom, dateTo, companyNos);
      setData(result);
    } catch (err) {
      setError("Unable to load P&L data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(companyNos), dateFrom, dateTo]);

  const formatPeriod = () => {
    try {
      const from = new Date(dateFrom).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
      const to = new Date(dateTo).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
      return `${from} – ${to}`;
    } catch {
      return `${dateFrom} – ${dateTo}`;
    }
  };

  const grossMarginPct =
    data?.revenue && data.gross_profit != null
      ? ((data.gross_profit / data.revenue) * 100).toFixed(1)
      : null;

  const netMarginPct =
    data?.revenue && data.net_profit != null
      ? ((data.net_profit / data.revenue) * 100).toFixed(1)
      : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Page header ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-[var(--card-border)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-foreground">Profitability</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {companyLabel} · {formatPeriod()}
            </p>
          </div>
          {data && !loading && (
            <div className="flex items-center gap-1.5">
              {grossMarginPct !== null && (
                <span className="text-xs text-muted-foreground bg-[var(--card)] border border-[var(--card-border)] rounded-full px-3 py-1">
                  Gross margin {grossMarginPct}%
                </span>
              )}
              {netMarginPct !== null && (
                <span className="text-xs text-muted-foreground bg-[var(--card)] border border-[var(--card-border)] rounded-full px-3 py-1">
                  Net margin {netMarginPct}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* P&L KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <PLCardSkeleton key={i} />)
          ) : (
            <>
              <PLCard
                title="Revenue / Income"
                subtitle="Accounts 10000–10585"
                value={data?.revenue}
                valueLY={data?.revenue_ly}
                yoyPct={data?.revenue_yoy_pct}
                icon={MoneyReceive02Icon}
                accentClass="bg-emerald-600"
                invoiceCount={data?.invoice_count}
              />
              <PLCard
                title="Cost of Sales"
                subtitle="Accounts 20000–48210"
                value={data?.cost_of_sales}
                icon={Store01Icon}
                accentClass="bg-rose-600"
                glRequired={!data?.gl_data_available}
              />
              <PLCard
                title="Gross Profit"
                subtitle={grossMarginPct ? `Margin ${grossMarginPct}%` : "Revenue − CoS"}
                value={data?.gross_profit ?? (data?.cost_of_sales == null ? data?.revenue : null)}
                icon={ChartUpIcon}
                accentClass="bg-indigo-600"
                glRequired={!data?.gl_data_available && data?.gross_profit == null}
              />
              <PLCard
                title="OPEX"
                subtitle="Overheads, Wages & Salaries"
                value={data?.opex}
                icon={Invoice01Icon}
                accentClass="bg-amber-600"
                glRequired={!data?.gl_data_available}
              />
              <PLCard
                title="Net Profit"
                subtitle={netMarginPct ? `Margin ${netMarginPct}%` : "Gross Profit − OPEX"}
                value={data?.net_profit}
                icon={ProfitIcon}
                accentClass="bg-violet-600"
                glRequired={!data?.gl_data_available && data?.net_profit == null}
              />
            </>
          )}
        </div>

        {/* GL sync notice */}
        {data && !data.gl_data_available && !loading && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
            <InformationCircleIcon size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Cost of Sales &amp; OPEX require GL voucher sync</p>
              <p className="text-xs text-muted-foreground mt-1">
                Revenue is computed from confirmed sales invoices. Cost of Sales (accounts 20000–48210)
                and OPEX (overhead, wages, salaries accounts) are sourced from GL voucher postings (GlVc register).
                Once GL voucher sync is enabled, all five P&amp;L metrics will populate automatically.
              </p>
            </div>
          </div>
        )}

        {/* Revenue breakdown hint */}
        {data && !loading && data.revenue > 0 && (
          <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Analytics01Icon size={15} className="text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Revenue Summary</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Period Total</p>
                <p className="text-base font-bold text-foreground tabular-nums" title={formatFull(data.revenue)}>
                  {formatCompact(data.revenue)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Same Period LY</p>
                <p className="text-base font-bold text-foreground tabular-nums" title={formatFull(data.revenue_ly)}>
                  {formatCompact(data.revenue_ly)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">YoY Change</p>
                <p className={`text-base font-bold tabular-nums ${
                  data.revenue_yoy_pct == null
                    ? "text-muted-foreground"
                    : data.revenue_yoy_pct >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  {data.revenue_yoy_pct != null
                    ? `${data.revenue_yoy_pct >= 0 ? "+" : ""}${data.revenue_yoy_pct.toFixed(1)}%`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Invoices</p>
                <p className="text-base font-bold text-foreground tabular-nums">
                  {(data.invoice_count ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
