'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchOrderById, formatRupees } from '../../../lib/storefront-client';
import { useCart } from '../../../lib/cart-context';

interface FetchedOrder {
  id: string;
  paymentStatus: string;
  totalAmount: string;
  discountAmount: string;
  amountCharged: string;
}

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [buyerToken, setBuyerToken] = useState<string>('');
  const [order, setOrder] = useState<FetchedOrder | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [polling, setPolling] = useState<boolean>(true);

  const { clearCart } = useCart();

  const checkOrderStatus = useCallback(async () => {
    if (!orderId || !buyerToken) return;
    try {
      const orderData = await fetchOrderById(buyerToken, orderId);
      setOrder(orderData);

      if (orderData.paymentStatus === 'PAID') {
        setPolling(false);
        clearCart(); // Clear cart once order is confirmed as PAID by server
      } else if (orderData.paymentStatus === 'FAILED' || orderData.paymentStatus === 'REFUND_REQUIRED') {
        setPolling(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(msg || 'Failed to poll order status');
    }
  }, [orderId, buyerToken, clearCart]);

  useEffect(() => {
    const token = sessionStorage.getItem('luxe_buyer_token');
    if (token) {
      setBuyerToken(token);
    }
  }, []);

  // Webhook-Is-Truth Status Polling loop every 2 seconds
  useEffect(() => {
    if (!polling || !orderId || !buyerToken) return;

    checkOrderStatus();
    const interval = setInterval(() => {
      checkOrderStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [polling, orderId, buyerToken, checkOrderStatus]);

  if (!orderId) {
    return (
      <div style={{ maxWidth: '600px', margin: '64px auto', textAlign: 'center' }}>
        <h2>No Order ID Provided</h2>
        <Link href="/products" className="btn btn-primary" style={{ marginTop: '16px' }}>
          Back to Storefront
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '48px 24px', minHeight: '80vh' }}>
      {!buyerToken ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
          <h3>Enter Buyer JWT Token to inspect Order Status</h3>
          <input
            type="password"
            className="form-input"
            placeholder="Paste Buyer JWT Token..."
            value={buyerToken}
            onChange={(e) => setBuyerToken(e.target.value)}
            style={{ maxWidth: '360px', margin: '16px auto', display: 'block' }}
          />
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '32px' }}>
          {errorAlert && (
            <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
              {errorAlert}
            </div>
          )}

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            {order?.paymentStatus === 'PAID' ? (
              <div>
                <span className="badge badge-success" style={{ fontSize: '1rem', padding: '8px 16px', marginBottom: '12px' }}>
                  ✓ Payment Confirmed & Paid
                </span>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Thank you for your order!</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Order ID: <code style={{ color: 'var(--accent-primary)' }}>{orderId}</code>
                </p>
              </div>
            ) : order?.paymentStatus === 'REFUND_REQUIRED' || order?.paymentStatus === 'FAILED' ? (
              <div>
                <span className="badge badge-danger" style={{ fontSize: '1rem', padding: '8px 16px', marginBottom: '12px' }}>
                  ✕ Payment Failed or Refunded
                </span>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Order Processing Failed</h1>
                <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                  Your payment could not be completed or stock reservation expired.
                </p>
              </div>
            ) : (
              <div>
                <span className="badge badge-warning" style={{ fontSize: '1rem', padding: '8px 16px', marginBottom: '12px' }}>
                  ⌛ Verifying Payment with Server...
                </span>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Processing Your Order</h1>
                <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                  Awaiting Razorpay HMAC Webhook confirmation... (Polling status)
                </p>
              </div>
            )}
          </div>

          {order && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '24px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Receipt Summary</h3>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.875rem', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Order Total:</span>
                  <span style={{ fontWeight: 600 }}>{formatRupees(order.totalAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Discount Applied:</span>
                  <span style={{ fontWeight: 600, color: 'var(--status-success-text)' }}>- {formatRupees(order.discountAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800 }}>
                  <span>Amount Charged:</span>
                  <span>{formatRupees(order.amountCharged)}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '32px' }}>
            <Link href="/products" className="btn btn-primary">
              Continue Shopping
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '64px' }}>Loading Order Status...</div>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}
