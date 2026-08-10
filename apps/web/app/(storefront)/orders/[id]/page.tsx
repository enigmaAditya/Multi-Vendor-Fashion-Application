'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchOrderById, formatRupees } from '../../../lib/storefront-client';

interface SubOrder {
  id: string;
  sellerId: string;
  status: string;
  shipmentStatus?: string;
  awbCode?: string;
  courierName?: string;
  amount: string;
  items?: Array<{
    id: string;
    skuId: string;
    price: string;
    quantity: number;
  }>;
}

interface OrderDetail {
  id: string;
  buyerId: string;
  paymentStatus: string;
  totalAmount: string;
  discountAmount: string;
  amountCharged: string;
  shippingAddress: Record<string, unknown>;
  createdAt: string;
  subOrders?: SubOrder[];
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const loadOrderDetail = useCallback(async (token: string, id: string) => {
    try {
      setLoading(true);
      setErrorAlert(null);
      const res = await fetchOrderById(token, id);
      setOrder(res as OrderDetail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(msg || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('luxe_buyer_token') || localStorage.getItem('luxe_buyer_token');
    if (token) {
      if (orderId) {
        loadOrderDetail(token, orderId);
      }
    } else {
      router.push(`/login?redirect=/orders/${orderId}`);
    }
  }, [orderId, loadOrderDetail, router]);

  const getShipmentStatusBadge = (status?: string) => {
    switch (status) {
      case 'DELIVERED':
        return { text: '✓ Delivered', class: 'badge-success' };
      case 'OUT FOR DELIVERY':
      case 'IN TRANSIT':
      case 'DISPATCHED':
      case 'PICKED UP':
        return { text: `🚚 ${status}`, class: 'badge-primary' };
      case 'PENDING_SYNC':
      default:
        return { text: '📦 Processing Order', class: 'badge-warning' };
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px', minHeight: '80vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/orders" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          ← Back to My Orders
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px' }}>
          Order Details #{orderId}
        </h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-muted)' }}>
          Loading order details...
        </div>
      ) : errorAlert ? (
        <div className="alert alert-danger">{errorAlert}</div>
      ) : order ? (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Status Header */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Placed on {new Date(order.createdAt).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '4px' }}>
                Payment Status: <span style={{ color: order.paymentStatus === 'PAID' ? 'var(--status-success-text)' : 'var(--text-primary)' }}>{order.paymentStatus}</span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Charged</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatRupees(order.amountCharged)}</div>
            </div>
          </div>

          {/* Sub-Orders & Shipment Tracking */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px' }}>
              Package Shipments & Tracking ({order.subOrders?.length || 0})
            </h3>

            {!order.subOrders || order.subOrders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No shipment packages created for this order.</p>
            ) : (
              <div style={{ display: 'grid', gap: '20px' }}>
                {order.subOrders.map((so, idx) => {
                  const badge = getShipmentStatusBadge(so.shipmentStatus);
                  return (
                    <div
                      key={so.id}
                      style={{
                        background: 'var(--bg-glass-element)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '20px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>
                            Package #{idx + 1} (Seller ID: <code style={{ fontSize: '0.75rem' }}>{so.sellerId.substring(0, 8)}...</code>)
                          </h4>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Sub-order ID: {so.id}
                          </div>
                        </div>

                        <span className={`badge ${badge.class}`} style={{ fontSize: '0.875rem', padding: '6px 12px' }}>
                          {badge.text}
                        </span>
                      </div>

                      {/* Shipment AWB Details */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '16px' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Courier Partner: </span>
                          <strong style={{ color: 'var(--text-primary)' }}>{so.courierName || 'Shiprocket (Pending)'}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>AWB Tracking Number: </span>
                          <strong style={{ color: 'var(--accent-primary)', fontFamily: 'monospace' }}>
                            {so.awbCode || 'Assigned upon pickup'}
                          </strong>
                        </div>
                      </div>

                      {/* Sub-order Items List */}
                      {so.items && so.items.length > 0 && (
                        <div>
                          <h5 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            Items in Package:
                          </h5>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {so.items.map((item) => (
                              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                                <span>SKU {item.skuId} × {item.quantity}</span>
                                <span>{formatRupees(item.price)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shipping Address Summary */}
          {order.shippingAddress && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '12px' }}>Shipping Address</h3>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                <div><strong>{String(order.shippingAddress.fullName || '')}</strong> ({String(order.shippingAddress.phone || '')})</div>
                <div>{String(order.shippingAddress.street || '')}</div>
                <div>{String(order.shippingAddress.city || '')}, {String(order.shippingAddress.state || '')} - {String(order.shippingAddress.pincode || '')}</div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
