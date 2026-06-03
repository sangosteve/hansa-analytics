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
  productGroupCode: string
) {
  const response = await fetch(
    `${API_BASE_URL}/customer-movement/${customerCode}/product-groups/${productGroupCode}/items`
  );
  if (!response.ok) throw new Error("Failed to fetch customer product group items");
  return response.json() as Promise<CustomerProductGroupItemsResponse>;
}

export async function rebuildCustomerMovement() {
  const response = await fetch(`${API_BASE_URL}/refresh/customer-movement`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to rebuild customer movement");
  return response.json();
}

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChartConfig = {
  type: "bar" | "line" | "pie" | "none";
  title: string;
  option: Record<string, unknown>;
};

export type AITableResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export type AIInsightResponse = {
  answer: string;
  chart?: AIChartConfig;
  table?: AITableResult;
  follow_up_questions: string[];
  tool_used?: string;
  tools_used: string[];
  intent?: string;
  company_scope?: string;
  assumptions: string[];
  warnings: string[];
};

export type AISuggestion = {
  text: string;
  icon?: string;
};

export async function askAIInsight(
  message: string,
  options?: {
    date_from?: string;
    date_to?: string;
    location?: string;
    salesperson?: string;
    item_group_code?: string;
    customer_code?: string;
    company_nos?: string[];
    sale_scope?: string;
    history?: AIChatMessage[];
  }
): Promise<AIInsightResponse> {
  const payload = { message, ...options };
  const response = await fetch(`${API_BASE_URL}/ai/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to get AI insight");
  return response.json() as Promise<AIInsightResponse>;
}

// ── Movement analytics types ──────────────────────────────────────────────

export type ProductGroupMovementRow = {
  group_code: string;
  group_name: string;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  ytd: number;
  lytd: number;
  last_sale: string | null;
  unique_customers: number;
  unique_items: number;
  status: "Growing" | "Declining" | "Stable" | "Dead" | "New";
  change_pct: number | null;
  yoy_pct: number | null;
};

export type SlowMovingItem = {
  item_code: string;
  item_name: string;
  group_code: string;
  group_name: string;
  total_tonnes: number;
  t3m: number;
  ytd: number;
  last_sale: string | null;
  days_since: number;
  customers: number;
  status: "Dead Stock" | "Very Slow" | "Slow Mover";
};

export type CustomerMovementRow = {
  customer_code: string;
  customer_name: string;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  last_purchase: string | null;
  days_since: number;
  product_groups: number;
  last_rep: string | null;
  top_group: string | null;
  status: "Active" | "At Risk" | "Stopped" | "Declining" | "Irregular";
  change_pct: number | null;
};

export type MovementSummary = {
  data_as_of: string;
  growing_groups: number;
  dead_groups: number;
  declining_groups: number;
  stopped_customers: number;
  at_risk_customers: number;
  slow_items: number;
  dead_items: number;
};

export type GroupMonthlyRow = {
  month: string;
  tonnes: number;
  customers: number;
  items: number;
};

export type GroupItemRow = {
  item_code: string;
  item_name: string;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  last_sale: string | null;
  days_since: number;
  customers: number;
  change_pct: number | null;
};

export type CustomerGroupRow = {
  group_code: string;
  group_name: string;
  total_tonnes: number;
  t3m: number;
  p3m: number;
  last_sale: string | null;
  items: number;
  change_pct: number | null;
};

export async function getMovementSummary(
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<MovementSummary> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/summary?${params}`);
  if (!res.ok) throw new Error("Failed to fetch movement summary");
  return res.json();
}

export async function getProductGroupMovement(
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<ProductGroupMovementRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/product-groups?${params}`);
  if (!res.ok) throw new Error("Failed to fetch product group movement");
  return res.json();
}

export async function getProductGroupMonthly(
  groupCode: string,
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<GroupMonthlyRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/product-groups/${groupCode}/monthly?${params}`);
  if (!res.ok) throw new Error("Failed to fetch group monthly");
  return res.json();
}

export async function getSlowMovingItems(
  companyNos: string[] = ["all"],
  saleScope: string = "all",
  groupCode?: string,
): Promise<SlowMovingItem[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  if (groupCode) params.set("group_code", groupCode);
  const res = await fetch(`${API_BASE_URL}/movement/items?${params}`);
  if (!res.ok) throw new Error("Failed to fetch slow moving items");
  return res.json();
}

export async function getProductGroupItems(
  groupCode: string,
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<GroupItemRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/product-groups/${encodeURIComponent(groupCode)}/items?${params}`);
  if (!res.ok) throw new Error("Failed to fetch group items");
  return res.json();
}

export async function getCustomerGroups(
  customerCode: string,
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<CustomerGroupRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/customers/${encodeURIComponent(customerCode)}/groups?${params}`);
  if (!res.ok) throw new Error("Failed to fetch customer groups");
  return res.json();
}

export async function getCustomerMovementAnalytics(
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<CustomerMovementRow[]> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/movement/customers?${params}`);
  if (!res.ok) throw new Error("Failed to fetch customer movement");
  return res.json();
}

// ── Predictive analytics types ────────────────────────────────────────────

export type MtdProjection = {
  month: string;
  days_elapsed: number;
  days_in_month: number;
  actual_tonnes: number;
  projected_eom_tonnes: number;
  same_period_last_year_tonnes: number;
  yoy_pct_change: number | null;
};

export type ProductGroupTrend = {
  code: string;
  name: string;
  current_3m_tonnes: number;
  prior_3m_tonnes: number;
  pct_change: number | null;
  trend: "growing" | "declining" | "stable" | "new" | "stopped";
};

export type CustomerLapseRisk = {
  customer_code: string;
  customer_name: string | null;
  tonnes_6m_prior: number;
  last_purchase_date: string | null;
  days_since_purchase: number | null;
  active_months_before: number;
  revenue_tier: "high" | "medium" | "low";
};

export type ProductToPush = {
  item_code: string;
  item_name: string | null;
  item_group_name: string | null;
  recent_3m_tonnes: number;
  prior_3m_tonnes: number;
  pct_change: number | null;
};

export type SalespersonTrend = {
  salesperson: string;
  current_3m_tonnes: number;
  prior_3m_tonnes: number;
  pct_change: number | null;
  trend: "growing" | "declining" | "stable" | "new";
};

export type PredictiveInsightsResponse = {
  company_nos: string[];
  sale_scope: string;
  reference_date: string | null;
  mtd_projection: MtdProjection | null;
  product_group_trends: ProductGroupTrend[];
  customer_lapse_risk: CustomerLapseRisk[];
  products_to_push: ProductToPush[];
  salesperson_trends: SalespersonTrend[];
};

export async function getPredictiveInsights(
  companyNos: string[] = ["all"],
  saleScope: string = "all",
): Promise<PredictiveInsightsResponse> {
  const params = new URLSearchParams({ sale_scope: saleScope });
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/analytics/predictive?${params}`);
  if (!res.ok) throw new Error("Failed to fetch predictive insights");
  return res.json();
}

export async function getAISuggestions(): Promise<AISuggestion[]> {
  const response = await fetch(`${API_BASE_URL}/ai/suggestions`);
  if (!response.ok) throw new Error("Failed to fetch AI suggestions");
  return response.json() as Promise<AISuggestion[]>;
}

// ── Stock status types ────────────────────────────────────────────────────────

export type StockRow = {
  company_no: string;
  art_code: string;
  location: string;
  item_name: string | null;
  item_group_code: string | null;
  item_group_name: string | null;
  instock: number;
  ord_out: number;
  po_qty: number;
  rsrv_qty: number;
  in_shipment: number;
  weighed_av_price: number | null;
  fetched_at: string | null;
};

export type StockSummary = {
  total_items: number;
  items_in_stock: number;
  items_zero_stock: number;
  stockout_with_orders: number;
  total_instock: number;
  total_ord_out: number;
  total_po_qty: number;
  total_in_shipment: number;
  last_fetched_at: string | null;
};

export async function getStockStatus(
  companyNos: string[] = ["all"],
  search?: string,
  groupCode?: string,
): Promise<StockRow[]> {
  const params = new URLSearchParams();
  appendCompanyNos(params, companyNos);
  if (search) params.set("search", search);
  if (groupCode) params.set("group_code", groupCode);
  const res = await fetch(`${API_BASE_URL}/stock?${params}`);
  if (!res.ok) throw new Error("Failed to fetch stock status");
  return res.json();
}

export async function getStockSummary(companyNos: string[] = ["all"]): Promise<StockSummary> {
  const params = new URLSearchParams();
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/stock/summary?${params}`);
  if (!res.ok) throw new Error("Failed to fetch stock summary");
  return res.json();
}

export async function triggerStockRefresh(companyNos: string[] = ["all"]): Promise<{ results: any[] }> {
  const params = new URLSearchParams();
  appendCompanyNos(params, companyNos);
  const res = await fetch(`${API_BASE_URL}/stock/refresh?${params}`, { method: "POST" });
  if (!res.ok) throw new Error("Stock refresh failed");
  return res.json();
}
