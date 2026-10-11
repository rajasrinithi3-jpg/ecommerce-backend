
import { auth } from "./firebase";

// Backend URL
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export function getBackendAssetUrl(path: string | null | undefined) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ---------------- API ERROR ----------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------- API FETCH ----------------

async function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);

  const token = await auth.currentUser?.getIdToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    const message =
      typeof body?.detail === "string"
        ? body.detail
        : `API request failed: ${response.status} ${response.statusText}`;

    if (
      (response.status === 401 || response.status === 403) &&
      (response.status === 401 || !url.endsWith("/auth/me"))
    ) {
      window.dispatchEvent(
        new CustomEvent("commerceiq:api-error", {
          detail: {
            status: response.status,
            message,
          },
        })
      );
    }

    throw new ApiError(response.status, message);
  }

  return response;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  return response.json() as Promise<T>;
}

// ---------------- AUTHENTICATION ----------------

export type AuthRole = "buyer" | "seller";

export type AuthUser = {
  uid: string;
  email: string | null;
  role: AuthRole;
};

export async function registerRole(role: AuthRole) {
  const response = await apiFetch(
    `${API_BASE_URL}/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    }
  );

  return response.json() as Promise<
    AuthUser & { created_at: string }
  >;
}

export async function getCurrentUser() {
  return fetchJSON<AuthUser>(
    `${API_BASE_URL}/auth/me`
  );
}

// ---------------- CHATBOT ----------------

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
  signal:
    | "BUY_NOW"
    | "GOOD_DEAL"
    | "WAIT"
    | "PRICE_RISING"
    | "NO_DATA";
};

export type ChatResponse = {
  reply: string;
  products: ChatProduct[];
  mode: "ai" | "offline";
};

export async function sendChat(
  message: string,
  history: ChatMessage[]
) {
  const response = await apiFetch(
    `${API_BASE_URL}/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        history: history.slice(-6),
      }),
    }
  );

  return response.json() as Promise<ChatResponse>;
}

// ---------------- CATEGORY ----------------

export type BackendCategory = {
  id: number;
  name: string;
};

// ---------------- PRODUCT ----------------

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
  seller_id?: string | null;
};

export async function getProducts() {
  return fetchJSON<BackendProduct[]>(
    `${API_BASE_URL}/products`
  );
}

export async function getProduct(id: number) {
  return fetchJSON<BackendProduct>(
    `${API_BASE_URL}/products/${id}`
  );
}

// ---------------- REVIEWS ----------------

export type BackendReview = {
  id: number;
  product_id: number;
  rating: number;
  comment?: string | null;
};

export async function getProductReviews(id: number) {
  return fetchJSON<BackendReview[]>(
    `${API_BASE_URL}/products/${id}/reviews`
  );
}

export async function addProductReview(
  id: number,
  rating: number,
  comment: string
) {
  const response = await apiFetch(
    `${API_BASE_URL}/products/${id}/reviews`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rating,
        comment,
      }),
    }
  );

  return response.json() as Promise<BackendReview>;
}

// ---------------- CATEGORIES API ----------------

export async function getCategories() {
  return fetchJSON<BackendCategory[]>(
    `${API_BASE_URL}/categories`
  );
}

// ---------------- RECOMMENDATIONS ----------------

export type Recommendation = {
  title: string;
  brand: string | null;
  categories: string | null;
  similarity_score: number;
};

export async function getProductRecommendations(
  id: number
) {
  try {
    return await fetchJSON<Recommendation[]>(
      `${API_BASE_URL}/products/${id}/recommendations`
    );
  } catch {
    return [];
  }
}

// ---------------- MARKET INSIGHTS ----------------

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
  recommendation:
    | "BUY_NOW"
    | "GOOD_DEAL"
    | "WAIT"
    | "PRICE_RISING"
    | "NO_DATA";
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

export async function getMarketInsight(id: number) {
  return fetchJSON<MarketInsight>(
    `${API_BASE_URL}/products/${id}/market-insight`
  );
}

// ---------------- STORE ANALYTICS ----------------

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

export async function getAnalyticsOverview() {
  return fetchJSON<AnalyticsOverview>(
    `${API_BASE_URL}/api/analytics/summary`
  );
}

// ---------------- BUYER DASHBOARD ----------------

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

export async function getBuyerDashboard() {
  return fetchJSON<BuyerDashboard>(
    `${API_BASE_URL}/analytics/buyer`
  );
}

// ---------------- SELLER ANALYTICS DASHBOARD ----------------

export type SellerSignal =
  | "RAISE_PRICE"
  | "SELL_NOW"
  | "REDUCE_PRICE";

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

export async function getSellerDashboard(
  categoryId?: number
) {
  const query =
    categoryId !== undefined
      ? `?category_id=${categoryId}`
      : "";

  return fetchJSON<SellerDashboard>(
    `${API_BASE_URL}/analytics/seller${query}`
  );
}

// ---------------- SELLER PRODUCT MANAGEMENT ----------------

// Product fields accepted by the seller product endpoints.
// The backend assigns seller_id from the authenticated user.
export type SellerProductInput = {
  title: string;
  description?: string | null;
  price: number;
  brand?: string | null;
  category_id: number;
};

// List the authenticated seller's products.
export async function getSellerProducts() {
  return fetchJSON<BackendProduct[]>(
    `${API_BASE_URL}/seller/products`
  );
}

// Create a new product.
export async function addSellerProduct(
  product: SellerProductInput
) {
  const response = await apiFetch(
    `${API_BASE_URL}/seller/products`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(product),
    }
  );

  return response.json() as Promise<BackendProduct>;
}

// Update an existing product owned by the seller.
export async function updateSellerProduct(
  id: number,
  product: Partial<SellerProductInput>
) {
  const response = await apiFetch(
    `${API_BASE_URL}/seller/products/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(product),
    }
  );

  return response.json() as Promise<BackendProduct>;
}

// Delete an existing product owned by the seller.
export async function deleteSellerProduct(id: number) {
  const response = await apiFetch(
    `${API_BASE_URL}/seller/products/${id}`,
    {
      method: "DELETE",
    }
  );

  return response.json() as Promise<{
    message: string;
    id: number;
  }>;
}

export async function uploadSellerProductImage(id: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(
    `${API_BASE_URL}/seller/products/${id}/image`,
    {
      method: "POST",
      body: formData,
    }
  );

  return response.json() as Promise<{
    message: string;
    image: string;
    product_id: number;
  }>;
}

// ---------------- ORDER HISTORY ----------------

export type OrderItem = {
  product_id: number;
  product_title: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type Order = {
  id: number;
  customer_name: string;
  phone: string;
  shipping_address: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: OrderItem[];
};

export async function createOrder(payload: {
  customer_name: string;
  phone: string;
  shipping_address: string;
  items: { product_id: number; quantity: number }[];
}) {
  const response = await apiFetch(`${API_BASE_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response.json() as Promise<Order>;
}

export async function getMyOrders() {
  return fetchJSON<Order[]>(`${API_BASE_URL}/orders/my-orders`);
}
