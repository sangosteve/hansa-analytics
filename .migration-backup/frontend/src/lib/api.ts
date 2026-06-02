const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

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
    `${API_BASE_URL}/sales-summary?${searchParams.toString()}`,
    {
      cache: "no-store",
    }
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
    `${API_BASE_URL}/customer-movement?${searchParams.toString()}`,
    {
      cache: "no-store",
    }
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
    `${API_BASE_URL}/customer-movement/${customerCode}/product-groups/${productGroupCode}/items`,
    {
      cache: "no-store",
    }
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

// AI Insights types and helpers

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

export async function askAIInsight(message: string, options?: {
  date_from?: string;
  date_to?: string;
  location?: string;
  salesperson?: string;
  item_group_code?: string;
  customer_code?: string;
}): Promise<AIInsightResponse> {
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
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to get AI insight");
  }

  return response.json() as Promise<AIInsightResponse>;
}

export async function getAISuggestions(): Promise<AISuggestion[]> {
  const response = await fetch(`${API_BASE_URL}/ai/suggestions`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch AI suggestions");
  }

  return response.json() as Promise<AISuggestion[]>;
}
