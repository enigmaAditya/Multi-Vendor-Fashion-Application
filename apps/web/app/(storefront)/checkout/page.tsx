'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '../../lib/cart-context';
import { formatRupees, initializeCheckout } from '../../lib/storefront-client';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function CheckoutPage() {
  const { cartItems, subtotalPaise } = useCart();
  const [buyerToken, setBuyerToken] = useState<string>('');
  const [couponCode, setCouponCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  // Address State
  const [fullName, setFullName] = useState('Rahul Sharma');
  const [phone, setPhone] = useState('+919876543210');
  const [street, setStreet] = useState('102 Luxury Park, Bandra West');
  const [city, setCity] = useState('Mumbai');
  const [state, setState] = useState('Maharashtra');
  const [pincode, setPincode] = useState('400050');

  const router = useRouter();

  useEffect(() => {
    // Read stored token and coupon code from sessionStorage or localStorage
    const storedToken = sessionStorage.getItem('luxe_buyer_token') || localStorage.getItem('luxe_buyer_token');
    const storedCoupon = sessionStorage.getItem('luxe_coupon_code');
    if (storedToken) {
      setBuyerToken(storedToken);
    } else {
      router.push('/login?redirect=/checkout');
    }
    if (storedCoupon) setCouponCode(storedCoupon);

    // Load Razorpay Checkout SDK script dynamically
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, [router]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerToken) {
      router.push('/login?redirect=/checkout');
      return;
    }
    if (cartItems.length === 0) {
      setErrorAlert('Your shopping bag is empty.');
      return;
    }

    try {
      setLoading(true);
      setErrorAlert(null);

      // Server-Authoritative Checkout payload: sends ONLY item references & quantities (NO client-calculated amounts)
      const payload = {
        cartItems: cartItems.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
        })),
        shippingAddress: {
          fullName,
          phone,
          street,
          city,
          state,
          pincode,
        },
        couponCode: couponCode || undefined,
      };

      const result = await initializeCheckout(buyerToken, payload);

      // Trigger Razorpay Web Checkout SDK
      if (window.Razorpay) {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_mockkey',
          amount: Number(result.amountCharged),
          currency: 'INR',
          name: 'Luxe Market',
          description: `Order ${result.orderId}`,
          order_id: result.gatewayOrderId,
          handler: function () {
            // Webhook-Is-Truth: Redirect to confirmation page to poll server PAID status
            router.push(`/orders/confirmation?orderId=${encodeURIComponent(result.orderId)}`);
          },
          prefill: {
            name: fullName,
            contact: phone,
          },
          theme: {
            color: '#6366f1',
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Fallback for test runner without SDK script
        router.push(`/orders/confirmation?orderId=${encodeURIComponent(result.orderId)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(`Checkout Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px', minHeight: '80vh' }}>
      <div style={{ marginBottom: '32px' }}>
        <Link href="/cart" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          ← Back to Shopping Bag
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px' }}>Checkout & Payment</h1>
      </div>

      {errorAlert && (
        <div className="alert alert-danger" style={{ marginBottom: '24px' }}>
          <span>{errorAlert}</span>
          <button onClick={() => setErrorAlert(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <form onSubmit={handleCheckoutSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px' }}>
        {/* Shipping Address Form */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '20px' }}>Shipping Address</h3>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="text"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Street Address</label>
            <input
              type="text"
              className="form-input"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">State</label>
              <input
                type="text"
                className="form-input"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Pincode</label>
              <input
                type="text"
                className="form-input"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* Checkout Summary & Pay Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>


          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Summary</h3>

            <div style={{ display: 'grid', gap: '12px', marginBottom: '16px', fontSize: '0.875rem' }}>
              {cartItems.map((item) => (
                <div key={item.skuId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {item.productName} × {item.quantity}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {formatRupees((BigInt(item.pricePaise || 0) * BigInt(item.quantity)).toString())}
                  </span>
                </div>
              ))}
            </div>

            {couponCode && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--status-success-text)', marginBottom: '12px' }}>
                Coupon <strong>{couponCode}</strong> will be applied by server during checkout.
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800 }}>
              <span>Bag Subtotal</span>
              <span>{formatRupees(subtotalPaise.toString())}</span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px', padding: '14px', fontSize: '1rem' }}
              disabled={loading || cartItems.length === 0}
            >
              {loading ? 'Initializing Order...' : 'Pay with Razorpay →'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
