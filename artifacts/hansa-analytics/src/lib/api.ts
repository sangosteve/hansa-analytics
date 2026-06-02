const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "/api";

export type CustomerMovementRow = {
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
  data: CustomerMovementRow[];
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

export type SalesSummaryResponse = {
  company_no: string;
  date_from: string;
  date_to: string;
  monthly_sales: SalesSummaryMonthlyRow[];
  rep_contribution: SalesSummaryRepRow[];
};

export async function getSalesSummary(
  dateFrom: string,
  dateTo: string,
  companyNo?: string
) {
  const searchParams = new URLSearchParams();
  searchParams.set("date_from", dateFrom);
  searchParams.set("date_to", dateTo);

  if (companyNo) {
    searchParams.set("company_no", companyNo);
  }

  const response = await fetch(
    `${API_BASE_URL}/sales-summary?${searchParams.toString()}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch sales summary");
  }

  return response.json() as Promise<SalesSummaryResponse>;
}

export async function getCustomerMovement(params?: {
  action_band?: string;
  buyer_status?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params?.action_band) searchParams.set("action_band", params.action_band);
  if (params?.buyer_status) searchParams.set("buyer_status", params.buyer_status);

  const response = await fetch(
    `${API_BASE_URL}/customer-movement?${searchParams.toString()}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch customer movement");
  }

  return response.json() as Promise<CustomerMovementResponse>;
}

export async function getCustomerProductGroupItems(
  customerCode: string,
  productGroupCode: string
) {
  const response = await fetch(
    `${API_BASE_URL}/customer-movement/${customerCode}/product-groups/${productGroupCode}/items`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch customer product group items");
  }

  return response.json() as Promise<CustomerProductGroupItemsResponse>;
}

export async function rebuildCustomerMovement() {
  const response = await fetch(`${API_BASE_URL}/refresh/customer-movement`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to rebuild customer movement");
  }

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
  assumptions: string[];
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
  }
): Promise<AIInsightResponse> {
  const payload = {
    message,
    ...options,
  };

  const response = await fetch(`${API_BASE_URL}/ai/insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to get AI insight");
  }

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

export async function getMovementSummary(companyNo = "3"): Promise<MovementSummary> {
  const res = await fetch(`${API_BASE_URL}/movement/summary?company_no=${companyNo}`);
  if (!res.ok) throw new Error("Failed to fetch movement summary");
  return res.json();
}

export async function getProductGroupMovement(companyNo = "3"): Promise<ProductGroupMovementRow[]> {
  const res = await fetch(`${API_BASE_URL}/movement/product-groups?company_no=${companyNo}`);
  if (!res.ok) throw new Error("Failed to fetch product group movement");
  return res.json();
}

export async function getProductGroupMonthly(groupCode: string, companyNo = "3"): Promise<GroupMonthlyRow[]> {
  const res = await fetch(`${API_BASE_URL}/movement/product-groups/${groupCode}/monthly?company_no=${companyNo}`);
  if (!res.ok) throw new Error("Failed to fetch group monthly");
  return res.json();
}

export async function getSlowMovingItems(companyNo = "3", groupCode?: string): Promise<SlowMovingItem[]> {
  const params = new URLSearchParams({ company_no: companyNo });
  if (groupCode) params.set("group_code", groupCode);
  const res = await fetch(`${API_BASE_URL}/movement/items?${params}`);
  if (!res.ok) throw new Error("Failed to fetch slow moving items");
  return res.json();
}

export async function getCustomerMovementAnalytics(companyNo = "3"): Promise<CustomerMovementRow[]> {
  const res = await fetch(`${API_BASE_URL}/movement/customers?company_no=${companyNo}`);
  if (!res.ok) throw new Error("Failed to fetch customer movement");
  return res.json();
}

export async function getAISuggestions(): Promise<AISuggestion[]> {
  const response = await fetch(`${API_BASE_URL}/ai/suggestions`);

  if (!response.ok) {
    throw new Error("Failed to fetch AI suggestions");
  }

  return response.json() as Promise<AISuggestion[]>;
}
