const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "/api";

function appendCompanyNos(params: URLSearchParams, companyNos: string[]) {
  if (!companyNos.length || companyNos.includes("all")) {
    params.append("company_nos", "all");
  } else {
    companyNos.forEach((c) => params.append("company_nos", c));
  }
}

export type LegacyCustomerMovementRow = {
  id: number;
  customer_code: string;
  customer_name: string | null;
  product_group_code: string;
  product_group_name: string | null;
  buying_months_6m: number;
  recent_buying_months_3m: number;
  avg_monthly_tonnes_6m: number;
  current_month_tonnes: number;
  expected_mtd_tonnes: number | null;
  tonnage_gap: number | null;
  gap_percent: number | null;
  last_purchase_date: string | null;
  days_since_last_purchase: number | null;
  last_salesperson: string | null;
  last_location: string | null;
  buyer_status: string | null;
  action_band: string | null;
};

export type CustomerMovementResponse = {
  count: number;
  sale_scope: string;
  data: LegacyCustomerMovementRow[];
};

export type CustomerProductGroupItem = {
  item_code: string;
  item_name: string | null;
  product_group_code: string;
  product_group_name: string | null;
  total_tonnes: number;
  current_month_tonnes: number;
  last_6m_tonnes: number;
  last_purchase_date: string | null;
  transaction_rows: number;
};

export type CustomerProductGroupItemsResponse = {
  customer_code: string;
  product_group_code: string;
  count: number;
  data: CustomerProductGroupItem[];
};

export type SalesSummaryMonthlyRow = {
  month_start: string;
  year: number;
  month: number;
  total_tonnes: number;
};

export type SalesSummaryRepRow = {
  salesperson: string;
  total_tonnes: number;
};

export type DivisionBreakdownRow = {
  company_no: string;
  label: string;
  total_tonnes: number;
};

export type SalesSummaryResponse = {
  company_no: string;
  company_nos: string[];
  sale_scope: string;
  date_from: string;
  date_to: string;
  monthly_sales: SalesSummaryMonthlyRow[];
  rep_contribution: SalesSummaryRepRow[];
  division_breakdown: DivisionBreakdownRow[];
};

export async function getSalesSummary(
  dateFrom: string,
  dateTo: string,
  companyNos: string[] = ["all"],
  saleScope: string = "all",
) {
  const params = new URLSearchParams();
  params.set("date_from", dateFrom);
  params.set("date_to", dateTo);
  params.set("sale_scope", saleScope);
  appendCompanyNos(params, companyNos);

  const response = await fetch(`${API_BASE_URL}/sales-summary?${params}`);
  if (!response.ok) throw new Error("Failed to fetch sales summary");
  return response.json() as Promise<SalesSummaryResponse>;
}

export async function getCustomerMovement(params?: {
  action_band?: string;
  buyer_status?: string;
  sale_scope?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.action_band) searchParams.set("action_band", params.action_band);
  if (params?.buyer_status) searchParams.set("buyer_status", params.buyer_status);
  if (params?.sale_scope) searchParams.set("sale_scope", params.sale_scope);

  const response = await fetch(`${API_BASE_URL}/customer-movement?${searchParams}`);
  if (!response.ok) throw new Error("Failed to fetch customer movement");
  return response.json() as Promise<CustomerMovementResponse>;
}

export async function getCustomerProductGroupItems(
  customerCode: string,
  productGroupCode: string,
): Promise<CustomerProductGroupItemsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/customer-movement/${customerCode}/product-groups/${productGroupCode}/items`,
  );
  if (!response.ok) throw new Error("Failed to fetch customer product group items");
  return response.json();
}

export type MovementSummary = {
  growing_groups: number;
  declining_groups: number;
  dead_groups: number;
  stopped_customers: number;
  at_risk_customers: number;
  slow_items: number;
  dead_items: number;
  data_as_of: string | null;
};

export type ProductGroupMovementRow = {
  group_code: string;
  group_name: string;
  status: string;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  change_pct: number | null;
  ytd: number;
  yoy_pct: number | null;
  unique_customers: number;
  unique_items: number;
  last_sale: string | null;
};

export type SlowMovingItem = {
  item_code: string;
  item_name: string;
  group_code: string;
  group_name: string;
  status: string;
  last_sale: string | null;
  days_since: number;
  ytd: number;
  total_tonnes: number;
  customers: number;
};

export type CustomerMovementRow = {
  customer_code: string;
  customer_name: string | null;
  status: string;
  last_purchase: string | null;
  days_since: number;
  t3m: number;
  p3m: number;
  change_pct: number | null;
  total_tonnes: number;
  top_group: string | null;
  last_rep: string | null;
};

export type GroupMonthlyRow = {
  month: string;
  tonnes: number;
};

export type GroupItemRow = {
  item_code: string;
  item_name: string | null;
  total_tonnes: number;
  qty_bought: number | null;
  qty_on_hand: number | null;
  t3m: number;
  p3m: number;
  change_pct: number | null;
  last_sale: string | null;
  days_since: number;
  customers: number;
};

export type CustomerGroupRow = {
  group_code: string;
  group_name: string | null;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  change_pct: number | null;
  last_sale: string | null;
  items: number;
};

export type StockRow = {
  art_code: string;
  location: string;
  instock: number;
  ord_out: number;
  po_qty: number;
  rsrv_qty: number;
  in_shipment: number;
  weighed_av_price: number | null;
  item_name: string | null;
  item_group_code: string | null;
  item_group_name: string | null;
};

export type StockSummary = {
  total_items: number;
  items_in_stock: number;
  items_zero_stock: number;
  stockout_with_orders: number;
  total_instock: number;
  total_ord_out: number;
  total_po_qty: number;
  last_fetched_at: string | null;
};

export async function getMovementSummary(companyNos: string[], saleScope: string): Promise<MovementSummary> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/summary?${params}`);
  if (!res.ok) throw new Error("Failed to fetch movement summary");
  return res.json();
}

export async function getProductGroupMovement(companyNos: string[], saleScope: string): Promise<ProductGroupMovementRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/product-groups?${params}`);
  if (!res.ok) throw new Error("Failed to fetch product group movement");
  return res.json();
}

export async function getSlowMovingItems(companyNos: string[], saleScope: string): Promise<SlowMovingItem[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/slow-items?${params}`);
  if (!res.ok) throw new Error("Failed to fetch slow-moving items");
  return res.json();
}

export async function getCustomerMovementAnalytics(companyNos: string[], saleScope: string): Promise<CustomerMovementRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/customers?${params}`);
  if (!res.ok) throw new Error("Failed to fetch customer movement analytics");
  return res.json();
}

export async function getProductGroupMonthly(groupCode: string, companyNos: string[], saleScope: string): Promise<GroupMonthlyRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/product-groups/${encodeURIComponent(groupCode)}/monthly?${params}`);
  if (!res.ok) throw new Error("Failed to fetch group monthly trend");
  return res.json();
}

export async function getProductGroupItems(groupCode: string, companyNos: string[], saleScope: string): Promise<GroupItemRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/product-groups/${encodeURIComponent(groupCode)}/items?${params}`);
  if (!res.ok) throw new Error("Failed to fetch group items");
  return res.json();
}

export async function getCustomerGroups(customerCode: string, companyNos: string[], saleScope: string): Promise<CustomerGroupRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/customers/${encodeURIComponent(customerCode)}/groups?${params}`);
  if (!res.ok) throw new Error("Failed to fetch customer groups");
  return res.json();
}

export async function getStockStatus(companyNos: string[]): Promise<StockRow[]> {
  const params = new URLSearchParams();
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/stock/status?${params}`);
  if (!res.ok) throw new Error("Failed to fetch stock status");
  return res.json();
}

export async function getStockSummary(companyNos: string[]): Promise<StockSummary> {
  const params = new URLSearchParams();
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/stock/summary?${params}`);
  if (!res.ok) throw new Error("Failed to fetch stock summary");
  return res.json();
}

export async function triggerStockRefresh(companyNos: string[]): Promise<{ results: any[] }> {
  const params = new URLSearchParams();
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/stock/refresh?${params}`, { method: "POST" });
  if (!res.ok) throw new Error("Stock refresh failed");
  return res.json();
}

// ── Refresh settings & job types ──────────────────────────────────────────────

export type RefreshSettings = {
  active_companies: string[];
  refresh_mode: "last_success_buffer" | "last_n_days" | "current_month" | "ytd";
  safety_buffer_days: number;
  last_n_days: number;
  include_master: boolean;
  include_invoices: boolean;
  include_deliveries: boolean;
  rebuild_facts: boolean;
  rebuild_movement: boolean;
  rebuild_stock: boolean;
  updated_at: string | null;
};

export type RefreshJobStep = {
  company: string;
  company_label: string;
  step: string;
  status: "pending" | "running" | "done" | "error" | "success";
  records: number;
  message: string;
  timestamp: string;
};

export type RefreshJob = {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  mode: string;
  companies: string[];
  date_from: string;
  date_to: string;
  current_step: string;
  steps: RefreshJobStep[];
  log: string[];
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

export type RefreshHistoryRow = {
  id: number;
  company_no: string;
  status: string;
  message: string | null;
  records_processed: number;
  date_from: string | null;
  date_to: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type CustomRefreshPayload = {
  company_nos: string[];
  date_from: string;
  date_to: string;
  include_master?: boolean;
  include_invoices?: boolean;
  include_deliveries?: boolean;
  rebuild_facts?: boolean;
  rebuild_movement?: boolean;
  rebuild_stock?: boolean;
};

export async function getRefreshSettings(): Promise<RefreshSettings> {
  const res = await fetch(`${API_BASE_URL}/refresh/settings`);
  if (!res.ok) throw new Error("Failed to fetch refresh settings");
  return res.json();
}

export async function updateRefreshSettings(settings: Partial<RefreshSettings>): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/refresh/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save refresh settings");
  return res.json();
}

export async function triggerDefaultRefresh(): Promise<RefreshJob> {
  const res = await fetch(`${API_BASE_URL}/refresh/default`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to start default refresh");
  return res.json();
}

export async function triggerCustomRefresh(payload: CustomRefreshPayload): Promise<RefreshJob> {
  const res = await fetch(`${API_BASE_URL}/refresh/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to start custom refresh");
  return res.json();
}

export async function getRefreshJobStatus(jobId: string): Promise<RefreshJob> {
  const res = await fetch(`${API_BASE_URL}/refresh/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job status");
  return res.json();
}

export async function getRefreshHistory(limit = 50): Promise<RefreshHistoryRow[]> {
  const res = await fetch(`${API_BASE_URL}/refresh/history?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch refresh history");
  return res.json();
}

// ── AI Insights ───────────────────────────────────────────────────────────────

export type AIChartConfig = {
  type: string;
  title: string;
  option: Record<string, unknown>;
};

export type AITableResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export type AISuggestion = {
  text: string;
  icon?: string | null;
};

export type AIInsightResponse = {
  answer: string;
  chart?: AIChartConfig | null;
  table?: AITableResult | null;
  follow_up_questions: string[];
  tools_used: string[];
  intent?: string | null;
  company_scope?: string | null;
  assumptions: string[];
  warnings: string[];
};

export type PredictiveInsightsResponse = {
  company_nos: string[];
  sale_scope: string;
  reference_date: string | null;
  mtd_projection: {
    month: string;
    days_elapsed: number;
    days_in_month: number;
    actual_tonnes: number;
    projected_eom_tonnes: number;
    same_period_last_year_tonnes: number;
    yoy_pct_change: number | null;
  } | null;
  product_group_trends: {
    code: string;
    name: string;
    current_3m_tonnes: number;
    prior_3m_tonnes: number;
    pct_change: number | null;
    trend: "growing" | "declining" | "stable" | "new" | "stopped";
  }[];
  customer_lapse_risk: {
    customer_code: string;
    customer_name: string | null;
    tonnes_6m_prior: number;
    last_purchase_date: string | null;
    days_since_purchase: number | null;
    active_months_before: number;
    revenue_tier: "high" | "medium" | "low";
  }[];
  products_to_push: {
    item_code: string;
    item_name: string | null;
    item_group_name: string | null;
    recent_3m_tonnes: number;
    prior_3m_tonnes: number;
    pct_change: number | null;
  }[];
  salesperson_trends: {
    salesperson: string;
    current_3m_tonnes: number;
    prior_3m_tonnes: number;
    pct_change: number | null;
    trend: "growing" | "declining" | "stable";
  }[];
};

export async function askAIInsight(
  message: string,
  opts: {
    company_nos?: string[];
    sale_scope?: string;
    date_from?: Date | string | null;
    date_to?: Date | string | null;
    history?: { role: string; content: string }[];
    location?: string;
    salesperson?: string;
    item_group_code?: string;
    customer_code?: string;
  } = {}
): Promise<AIInsightResponse> {
  const body = {
    message,
    company_nos: opts.company_nos,
    sale_scope: opts.sale_scope ?? "all",
    date_from: opts.date_from instanceof Date ? opts.date_from.toISOString().slice(0, 10) : (opts.date_from ?? null),
    date_to: opts.date_to instanceof Date ? opts.date_to.toISOString().slice(0, 10) : (opts.date_to ?? null),
    history: opts.history ?? [],
    location: opts.location,
    salesperson: opts.salesperson,
    item_group_code: opts.item_group_code,
    customer_code: opts.customer_code,
  };
  const res = await fetch(`${API_BASE_URL}/ai/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("AI insight request failed");
  return res.json();
}

export async function getAISuggestions(): Promise<AISuggestion[]> {
  const res = await fetch(`${API_BASE_URL}/ai/suggestions`);
  if (!res.ok) throw new Error("Failed to fetch AI suggestions");
  return res.json();
}

export type CustomerHistoryMonthRow = {
  month: string;
  tonnes: number;
  txn_count: number;
};

export type CustomerHistoryGroupRow = {
  group_code: string;
  group_name: string;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  change_pct: number | null;
  last_sale: string | null;
  items: number;
};

export type CustomerHistoryItemRow = {
  item_code: string;
  item_name: string;
  group_name: string;
  total_tonnes: number;
  last_sale: string | null;
  days_since: number | null;
};

export type CustomerHistoryResponse = {
  customer_code: string;
  customer_name: string;
  total_tonnes: number;
  first_purchase: string | null;
  last_purchase: string | null;
  active_months: number;
  monthly: CustomerHistoryMonthRow[];
  by_group: CustomerHistoryGroupRow[];
  top_items: CustomerHistoryItemRow[];
};

export async function getCustomerHistory(
  customerCode: string,
  companyNos: string[],
  saleScope: string,
): Promise<CustomerHistoryResponse> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/analytics/customer-history/${encodeURIComponent(customerCode)}?${params}`);
  if (!res.ok) throw new Error("Failed to fetch customer history");
  return res.json();
}

export async function getPredictiveInsights(
  companyNos: string[],
  saleScope: string
): Promise<PredictiveInsightsResponse> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/analytics/predictive?${params}`);
  if (!res.ok) throw new Error("Failed to fetch predictive insights");
  return res.json();
}

// ── Hansa OAuth ───────────────────────────────────────────────────────────────

export type OAuthStatus = {
  connected: boolean;
  status: "not_connected" | "connected" | "expired" | "error" | "not_configured";
  auth_mode: string;
  token_type?: string;
  scope?: string | null;
  expires_at?: string | null;
  last_connected?: string | null;
  has_refresh?: boolean;
  message?: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  auth_mode: string;
  status: string;
  http_status?: number;
  message: string;
};

export async function getOAuthStatus(): Promise<OAuthStatus> {
  const res = await fetch(`${API_BASE_URL}/hansa/oauth/status`);
  if (!res.ok) throw new Error("Failed to fetch OAuth status");
  return res.json();
}

export async function getOAuthStartUrl(returnUrl: string): Promise<{ auth_url: string; state: string }> {
  const params = new URLSearchParams({ return_url: returnUrl });
  const res = await fetch(`${API_BASE_URL}/hansa/oauth/start?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Failed to start OAuth flow");
  }
  return res.json();
}

export async function disconnectOAuth(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/hansa/oauth/disconnect`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to disconnect");
  return res.json();
}

export async function testHansaConnection(): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE_URL}/hansa/test-connection`);
  if (!res.ok) throw new Error("Test request failed");
  return res.json();
}
