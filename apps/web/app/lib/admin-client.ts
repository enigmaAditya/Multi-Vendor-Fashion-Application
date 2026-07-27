const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function formatRupees(paise: string | number | bigint): string {
  const num = typeof paise === 'bigint' ? Number(paise) : Math.round(Number(paise || 0));
  const rupees = num / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees);
}

function getAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface FinancialSummaryResponse {
  gmv: string;
  totalCommission: string;
  totalPayouts: string;
  platformPromoExpenses: string;
}

export interface SellerRecord {
  id: string;
  phone: string;
  roles: string[];
  createdAt: string;
  linkedAccount?: {
    id: string;
    sellerId: string;
    gatewayAccountId: string;
    status: string; // "ACTIVE", "SUSPENDED"
  } | null;
}

export interface ProductModerationItem {
  id: string;
  name: string;
  slug: string;
  status: string; // "PENDING_REVIEW"
  createdAt: string;
  seller?: {
    id: string;
    phone: string;
  };
  category?: {
    id: string;
    name: string;
  };
  brand?: {
    id: string;
    name: string;
  };
  variants?: Array<{
    id: string;
    images?: Array<{ url: string }>;
    skus?: Array<{ price: string; quantity?: number }>;
  }>;
}

export async function fetchFinancialSummary(token: string): Promise<FinancialSummaryResponse> {
  const res = await fetch(`${API_BASE_URL}/admin/finance/summary`, {
    headers: getAuthHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch financial summary' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSellers(
  token: string,
  kycStatus?: 'ACTIVE' | 'SUSPENDED',
): Promise<SellerRecord[]> {
  const url = new URL(`${API_BASE_URL}/admin/sellers`);
  if (kycStatus) {
    url.searchParams.set('kycStatus', kycStatus);
  }
  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch sellers' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function approveSellerKyc(
  token: string,
  sellerId: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string,
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/sellers/${sellerId}/kyc`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ status, rejectionReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to update seller KYC' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchModerationQueue(
  token: string,
  limit = 20,
): Promise<ProductModerationItem[]> {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/moderation-queue?limit=${limit}`, {
    headers: getAuthHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch moderation queue' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function moderateProduct(
  token: string,
  productId: string,
  status: 'LIVE' | 'REJECTED' | 'SUSPENDED',
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/products/${productId}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to moderate product' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function moderateReview(
  token: string,
  reviewId: string,
  status: 'APPROVED' | 'REJECTED',
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to moderate review' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function setCommissionRule(
  token: string,
  payload: { categoryId?: string; sellerId?: string; ratePercent: number },
): Promise<{ id: string; ratePercent: number }> {
  const res = await fetch(`${API_BASE_URL}/admin/commissions`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to set commission rule' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}
