'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchMyOrders, formatRupees } from '../../lib/storefront-client';

interface OrderSummary {
  id: string;
  gatewayOrderId: string;
  paymentStatus: string;
  totalAmount: string;
  discountAmount: string;
  amountCharged: string;
  createdAt: string;
  subOrders?: Array<{
    id: string;
    shipmentStatus?: string;
    amount: string;
  }>;
}

export default function OrderHistoryPage() {
  const [buyerToken, setBuyerToken] = useState<string>('');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const loadOrders = useCallback(async (token: string) => {
    try {
      setLoading(true);
      setErrorAlert(null);
      const res = await fetchMyOrders(token);
      setOrders(res.orders || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(msg || 'Failed to fetch order history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('luxe_buyer_token');
    if (token) {
      setBuyerToken(token);
      loadOrders(token);
    } else {
      setLoading(false);
    }
  }, [loadOrders]);

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (buyerToken.trim()) {
      sessionStorage.setItem('luxe_buyer_token', buyerToken.trim());
      loadOrders(buyerToken.trim());
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'badge-success';
      case 'PENDING':
        return 'badge-warning';
      case 'REFUND_REQUIRED':
      case 'FAILED':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px', minHeight: '80vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>My Orders & Purchase History</h1>
        <Link href="/products" className="btn btn-secondary btn-sm">
          ← Continue Shopping
        </Link>
      </div>

      {!buyerToken ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>Authentication Required</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
            Paste your Buyer JWT Token to view your order history & shipment tracking.
          </p>
          <form onSubmit={handleTokenSubmit} style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', gap: '8px' }}>
            <input
              type="password"
              className="form-input"
              placeholder="Paste Buyer JWT Token..."
              value={buyerToken}
              onChange={(e) => setBuyerToken(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">
              View
            </button>
          </form>
        </div>
      ) : (
        <div>
          {errorAlert && (
            <div className="alert alert-danger" style={{ marginBottom: '24px' }}>
              {errorAlert}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-muted)' }}>
              Loading your orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="glass-panel" style={{ padding: '64px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>No Orders Found</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                You haven&apos;t placed any orders yet.
              </p>
              <Link href="/products" className="btn btn-primary">
                Shop Apparel
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {orders.map((order) => {
                const createdDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <div key={order.id} className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          Placed on {createdDate}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '1.125rem', marginTop: '2px' }}>
                          Order ID: <code style={{ color: 'var(--accent-primary)' }}>{order.id}</code>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span className={`badge ${getStatusBadgeClass(order.paymentStatus)}`}>
                          {order.paymentStatus}
                        </span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                          {formatRupees(order.amountCharged)}
                        </span>
                      </div>
                    </div>

                    {/* Sub-Orders Shipment Summary */}
                    {order.subOrders && order.subOrders.length > 0 && (
                      <div style={{ marginBottom: '16px', fontSize: '0.875rem' }}>
                        <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>
                          Shipment Packages ({order.subOrders.length}):
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {order.subOrders.map((so, idx) => (
                            <span key={so.id} style={{ background: 'var(--bg-glass-element)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                              Package #{idx + 1}: <strong>{so.shipmentStatus || 'PROCESSING'}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                      <Link href={`/orders/${order.id}`} className="btn btn-secondary btn-sm">
                        View Details & Tracking →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
