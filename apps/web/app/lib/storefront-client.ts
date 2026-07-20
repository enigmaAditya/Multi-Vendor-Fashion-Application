import { formatRupees } from './admin-client';

export { formatRupees };

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: CategoryNode[];
}

export interface SkuItem {
  id: string;
  skuCode: string;
  price: string;
  attributes: Record<string, string>;
  quantity?: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  color?: string;
  size?: string;
  images?: Array<{ url: string; isPrimary?: boolean }>;
  skus?: SkuItem[];
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string; // "LIVE"
  createdAt: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  brand?: {
    id: string;
    name: string;
    slug: string;
  };
  seller?: {
    id: string;
    phone: string;
  };
  variants?: ProductVariant[];
  averageRating?: number;
  totalReviews?: number;
}

export interface SearchProductCard {
  id: string;
  name: string;
  slug: string;
  brandName?: string;
  categoryName?: string;
  pricePaise: string;
  imageUrl?: string;
  averageRating?: number;
  totalReviews?: number;
  inStock?: boolean;
}

export interface SearchResponse {
  items: SearchProductCard[];
  total: number;
  page: number;
  limit: number;
}

// 1. Fetch Categories Tree (GET /categories/tree)
export async function fetchCategories(): Promise<CategoryNode[]> {
  const res = await fetch(`${API_BASE_URL}/categories/tree`, { cache: 'no-store' });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// 2. Search Products (GET /search)
export async function searchProducts(params: {
  q?: string;
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}): Promise<SearchResponse> {
  const url = new URL(`${API_BASE_URL}/search`);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.categoryId) url.searchParams.set('categoryId', params.categoryId);
  if (params.brandId) url.searchParams.set('brandId', params.brandId);
  if (params.minPrice !== undefined) url.searchParams.set('minPrice', params.minPrice.toString());
  if (params.maxPrice !== undefined) url.searchParams.set('maxPrice', params.maxPrice.toString());
  if (params.page) url.searchParams.set('page', params.page.toString());
  if (params.limit) url.searchParams.set('limit', params.limit.toString());

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    return { items: [], total: 0, page: 1, limit: 20 };
  }
  return res.json();
}

// 3. Fetch Product by Slug (GET /products/:slug)
export async function fetchProductBySlug(slug: string): Promise<ProductDetail | null> {
  const res = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (!res.ok) {
    return null;
  }
  return res.json();
}

// 4. Non-Blocking Fire-and-Forget Product View Tracking (POST /recommendations/views/:productId)
export function trackProductView(productId: string, token?: string): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  fetch(`${API_BASE_URL}/recommendations/views/${encodeURIComponent(productId)}`, {
    method: 'POST',
    headers,
  }).catch(() => {
    // Fire-and-forget: ignore network errors so PDP render is never blocked
  });
}

// 5. Fetch Trending Products (GET /recommendations/trending)
export async function fetchTrendingProducts(limit = 10): Promise<SearchProductCard[]> {
  const res = await fetch(`${API_BASE_URL}/recommendations/trending?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// 6. Fetch Similar Products (GET /recommendations/similar/:productId)
export async function fetchSimilarProducts(productId: string, limit = 8): Promise<SearchProductCard[]> {
  const res = await fetch(
    `${API_BASE_URL}/recommendations/similar/${encodeURIComponent(productId)}?limit=${limit}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// 7. Fetch Customers Also Bought (GET /recommendations/also-bought/:productId)
export async function fetchAlsoBought(productId: string, limit = 8): Promise<SearchProductCard[]> {
  const res = await fetch(
    `${API_BASE_URL}/recommendations/also-bought/${encodeURIComponent(productId)}?limit=${limit}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// 8. Fetch Recently Viewed Products (GET /recommendations/recently-viewed)
export async function fetchRecentlyViewed(token: string, limit = 8): Promise<SearchProductCard[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE_URL}/recommendations/recently-viewed?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// 9. Coupon Discount Validation Preview (POST /coupons/validate)
export async function validateCoupon(
  token: string,
  code: string,
  cartItems: { skuId: string; quantity: number }[],
): Promise<{ coupon: { id: string; code: string; discountType: string; fundingType: string }; discountAmount: string; qualifyingSubtotal: string }> {
  const res = await fetch(`${API_BASE_URL}/coupons/validate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, cartItems }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Invalid or expired coupon code' }));
    throw new Error(err.message || 'Coupon validation failed');
  }
  return res.json();
}

// 10. Initialize Checkout Session (POST /orders/checkout - Server-Authoritative)
export async function initializeCheckout(
  token: string,
  payload: {
    cartItems: { skuId: string; quantity: number }[];
    shippingAddress: {
      fullName: string;
      phone: string;
      street: string;
      city: string;
      state: string;
      pincode: string;
    };
    couponCode?: string;
  },
): Promise<{
  orderId: string;
  gatewayOrderId: string;
  totalAmount: string;
  discountAmount: string;
  amountCharged: string;
  reservationCode: string;
}> {
  const res = await fetch(`${API_BASE_URL}/orders/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to initialize checkout session' }));
    throw new Error(err.message || 'Checkout initialization failed');
  }
  return res.json();
}

// 11. Single Order Status Lookup for Polling (GET /orders/:id)
export async function fetchOrderById(
  token: string,
  orderId: string,
): Promise<{
  id: string;
  buyerId: string;
  paymentStatus: string; // "PENDING", "PAID", "REFUND_REQUIRED", "FAILED"
  totalAmount: string;
  discountAmount: string;
  amountCharged: string;
  shippingAddress: Record<string, unknown>;
  createdAt: string;
  subOrders?: Array<{
    id: string;
    status: string;
    amount: string;
    items?: Array<{ id: string; price: string; quantity: number }>;
  }>;
}> {
  const res = await fetch(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch order details' }));
    throw new Error(err.message || 'Order lookup failed');
  }
  return res.json();
}

// 12. Fetch Buyer Order History List (GET /orders/my-orders)
export async function fetchMyOrders(token: string): Promise<{
  orders: Array<{
    id: string;
    gatewayOrderId: string;
    paymentStatus: string;
    totalAmount: string;
    discountAmount: string;
    amountCharged: string;
    createdAt: string;
    subOrders?: Array<{
      id: string;
      sellerId: string;
      status: string;
      shipmentStatus?: string;
      awbCode?: string;
      courierName?: string;
      amount: string;
      items?: Array<{ id: string; price: string; quantity: number }>;
    }>;
  }>;
}> {
  const res = await fetch(`${API_BASE_URL}/orders/my-orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch order history' }));
    throw new Error(err.message || 'Order history lookup failed');
  }
  return res.json();
}

// 13. Create Product Review (POST /reviews)
export async function createReview(
  token: string,
  payload: {
    productId: string;
    rating: number;
    title?: string;
    comment?: string;
  },
): Promise<{
  id: string;
  productId: string;
  buyerId: string;
  rating: number;
  title?: string;
  comment?: string;
  status: string;
}> {
  const res = await fetch(`${API_BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to submit review' }));
    const errorObj = new Error(err.message || 'Review submission failed') as Error & { status?: number };
    errorObj.status = res.status;
    throw errorObj;
  }
  return res.json();
}
