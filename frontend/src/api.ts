// API_BASE_URL is read from a Vite env var so the app can point at a
// backend running on another machine on the LAN without a code change.
// Set VITE_API_BASE_URL in a .env file (see .env.example) e.g.:
//   VITE_API_BASE_URL=http://192.168.1.23:8000
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatProduct = {
  id: number;
  title: string;
  brand: string | null;
  price: number;
  rating: number | null;
  discount_pct: number | null;
  image: string | null;
  signal: "BUY_NOW" | "GOOD_DEAL" | "WAIT" | "PRICE_RISING" | "NO_DATA";
};

export type ChatResponse = {
  reply: string;
  products: ChatProduct[];
  mode: "ai" | "offline";
};

export async function sendChat(message: string, history: ChatMessage[]) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-6) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail || "Chat request failed. Please try again.");
  }
  return response.json() as Promise<ChatResponse>;
}

export type BackendCategory = {
  id: number;
  name: string;
};

export type BackendProduct = {
  id: number;
  title: string;
  description?: string | null;
  price: number;
  brand?: string | null;
  category_id: number;
  initial_price?: number | null;
  discount_pct?: number | null;
  rating?: number | null;
  reviews_count?: number | null;
  image?: string | null;
  url?: string | null;
  bought_past_month?: number | null;
  bs_rank?: number | null;
  number_of_sellers?: number | null;
};

export type BackendReview = {
  id: number;
  product_id: number;
  rating: number;
  comment?: string | null;
};

export type Recommendation = {
  title: string;
  brand: string | null;
  categories: string | null;
  similarity_score: number;
};

export type Competitor = {
  id: number;
  title: string;
  brand: string | null;
  price: number;
  rating: number | null;
  discount_pct: number | null;
  price_diff_pct: number | null;
  image: string | null;
};

export type BuyOrWait = {
  recommendation: "BUY_NOW" | "GOOD_DEAL" | "WAIT" | "PRICE_RISING" | "NO_DATA";
  reason: string;
};

export type MarketInsight = {
  product_id: number;
  profit_loss: {
    current_price: number;
    initial_price: number | null;
    discount_pct: number | null;
    listing_age_days: number | null;
  };
  buy_or_wait: BuyOrWait;
  competitors: Competitor[];
};

export type CategoryBreakdown = {
  category: string;
  product_count: number;
  avg_price: number;
  avg_rating: number | null;
};

export type AnalyticsOverview = {
  generated_at: string;
  total_products: number;
  total_categories: number;
  average_rating: number | null;
  average_discount_pct: number | null;
  category_breakdown: CategoryBreakdown[];
  top_discounts: {
    id: number;
    title: string;
    brand: string | null;
    price: number;
    discount_pct: number;
  }[];
  trending: {
    id: number;
    title: string;
    brand: string | null;
    bought_past_month: number;
  }[];
};

// Get all products
export async function getProducts() {
  return fetchJSON<BackendProduct[]>(`${API_BASE_URL}/products`);
}

// Get one product
export async function getProduct(id: number) {
  return fetchJSON<BackendProduct>(`${API_BASE_URL}/products/${id}`);
}

// Get product reviews
export async function getProductReviews(id: number) {
  return fetchJSON<BackendReview[]>(
    `${API_BASE_URL}/products/${id}/reviews`
  );
}

export async function addProductReview(id: number, rating: number, comment: string) {
  const response = await fetch(`${API_BASE_URL}/products/${id}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, comment }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Couldn't submit your review.");
  }
  return response.json() as Promise<BackendReview>;
}

// Get categories
export async function getCategories() {
  return fetchJSON<BackendCategory[]>(`${API_BASE_URL}/categories`);
}

// Get AI recommendations for a product, by its database id.
// Falls back gracefully (empty array) if the backend has no match
// for this product's title in the recommendation dataset.
export async function getProductRecommendations(id: number) {
  try {
    return await fetchJSON<Recommendation[]>(
      `${API_BASE_URL}/products/${id}/recommendations`
    );
  } catch {
    return [];
  }
}

// Profit/loss, buy-or-wait signal, and category competitors for one product.
export async function getMarketInsight(id: number) {
  return fetchJSON<MarketInsight>(
    `${API_BASE_URL}/products/${id}/market-insight`
  );
}

// Store-wide analytics: category breakdown, biggest discounts, trending
// products. Computed fresh from the database on every call.
export async function getAnalyticsOverview() {
  return fetchJSON<AnalyticsOverview>(`${API_BASE_URL}/api/analytics/summary`);
}

export type DealProduct = {
  id: number;
  title: string;
  brand: string | null;
  price: number;
  initial_price: number | null;
  discount_pct: number | null;
  rating: number | null;
  reviews_count: number | null;
  bought_past_month: number | null;
};

export type BuyerDashboard = {
  generated_at: string;
  best_deals: DealProduct[];
  wait_list: DealProduct[];
  top_rated: DealProduct[];
  trending: DealProduct[];
};

export type SellerSignal = "RAISE_PRICE" | "SELL_NOW" | "REDUCE_PRICE";

export type SellerDashboard = {
  generated_at: string;
  scope: string;
  kpis: {
    product_count: number;
    avg_price: number | null;
    median_price: number | null;
    avg_discount_pct: number | null;
    avg_rating: number | null;
    avg_sellers_per_product: number | null;
  };
  pricing_opportunities: {
    id: number;
    title: string;
    category: string | null;
    price: number;
    price_vs_category_median_pct: number;
    bought_past_month: number | null;
    rating: number | null;
    signal: SellerSignal;
    reason: string;
  }[];
  margin_pressure: {
    id: number;
    title: string;
    price: number;
    initial_price: number | null;
    discount_pct: number;
  }[];
  demand_snapshot: {
    id: number;
    title: string;
    bought_past_month: number;
    estimated_weekly_units: number;
  }[];
  competition: {
    category_id: number;
    category: string;
    product_count: number;
    avg_sellers_per_product: number | null;
    avg_discount_pct: number | null;
  }[];
};

export async function getBuyerDashboard() {
  return fetchJSON<BuyerDashboard>(`${API_BASE_URL}/analytics/buyer`);
}

export async function getSellerDashboard(categoryId?: number) {
  const query = categoryId !== undefined ? `?category_id=${categoryId}` : "";
  return fetchJSON<SellerDashboard>(`${API_BASE_URL}/analytics/seller${query}`);
}
