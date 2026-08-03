import { API_BASE_URL } from './storefront-client';
import { CreateProductPayload, ProductDetail } from '@marketplace/types';

export type { CreateProductPayload };

export interface SellerPayoutSummary {
  payouts: Array<{
    id: string;
    subOrderId: string;
    grossAmount: string;
    commissionAmount: string;
    netAmount: string;
    status: string;
    createdAt: string;
  }>;
}

export interface SellerSubOrder {
  id: string;
  orderId: string;
  sellerId: string;
  status: string;
  shipmentStatus?: string;
  awbCode?: string;
  courierName?: string;
  amount: string;
  createdAt: string;
  items?: Array<{
    id: string;
    skuId: string;
    price: string;
    quantity: number;
  }>;
}

// 1. Link Seller Payout Gateway Account (POST /payouts/sellers/payout-account)
export async function linkPayoutAccount(
  token: string,
  gatewayAccountId: string,
): Promise<{ success: boolean; gatewayAccountId: string }> {
  const res = await fetch(`${API_BASE_URL}/payouts/sellers/payout-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ gatewayAccountId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to link payout account' }));
    throw new Error(err.message || 'Account linking failed');
  }
  return res.json();
}

// 2. Fetch Seller Payout History (GET /payouts/sellers/my-payouts)
export async function fetchMyPayouts(token: string): Promise<SellerPayoutSummary> {
  const res = await fetch(`${API_BASE_URL}/payouts/sellers/my-payouts`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch seller payouts' }));
    throw new Error(err.message || 'Payout fetch failed');
  }
  return res.json();
}

// 3. Create Product Catalog Entry (POST /products)
export async function createSellerProduct(
  token: string,
  payload: CreateProductPayload,
): Promise<{ product: ProductDetail }> {
  const res = await fetch(`${API_BASE_URL}/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to create product' }));
    throw new Error(err.message || 'Product creation failed');
  }
  return res.json();
}

// 4. Submit Product for Admin Moderation (POST /products/:id/submit)
export async function submitProductForReview(
  token: string,
  productId: string,
): Promise<{ product: ProductDetail }> {
  const res = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(productId)}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to submit product' }));
    throw new Error(err.message || 'Product submission failed');
  }
  return res.json();
}

// 5. Replenish Warehouse Stock (POST /inventory/stock)
export async function addInventoryStock(
  token: string,
  payload: {
    skuId: string;
    warehouseId: string;
    quantityDelta: number;
    reason?: string;
  },
): Promise<{ id: string; skuId: string; onHand: number }> {
  const res = await fetch(`${API_BASE_URL}/inventory/stock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to adjust stock' }));
    throw new Error(err.message || 'Stock adjustment failed');
  }
  return res.json();
}

// 6. Fetch Seller Sub-Orders Queue (GET /orders/seller-orders)
export async function fetchSellerOrders(token: string): Promise<{ subOrders: SellerSubOrder[] }> {
  const res = await fetch(`${API_BASE_URL}/orders/seller-orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to fetch seller orders' }));
    throw new Error(err.message || 'Order fetch failed');
  }
  return res.json();
}

// 7. Dispatch Shipment & Generate AWB (POST /logistics/seller/sub-orders/:subOrderId/dispatch)
export async function dispatchSubOrderShipment(
  token: string,
  subOrderId: string,
): Promise<{ success: boolean; message?: string; awbCode?: string }> {
  const res = await fetch(`${API_BASE_URL}/logistics/seller/sub-orders/${encodeURIComponent(subOrderId)}/dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Shipment dispatch failed' }));
    throw new Error(err.message || 'Dispatch failed');
  }
  return res.json();
}
