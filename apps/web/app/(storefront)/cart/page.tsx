'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '../../lib/cart-context';
import { formatRupees, validateCoupon } from '../../lib/storefront-client';

export default function CartPage() {
  const { cartItems, updateQuantity, removeFromCart, subtotalPaise } = useCart();
  const [buyerToken, setBuyerToken] = useState<string>('');
  const [couponCode, setCouponCode] = useState<string>('');
  const [validatedCoupon, setValidatedCoupon] = useState<{
    code: string;
    discountAmount: string;
    qualifyingSubtotal: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const router = useRouter();

  const discountPaise = validatedCoupon ? BigInt(validatedCoupon.discountAmount) : 0n;
  const estimatedTotalPaise = subtotalPaise > discountPaise ? subtotalPaise - discountPaise : 0n;

  const handleValidateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    if (!buyerToken) {
      setCouponError('Please enter a Buyer JWT token to preview coupon discounts.');
      return;
    }
    try {
      setIsValidating(true);
      setCouponError(null);
      const res = await validateCoupon(
        buyerToken,
        couponCode.trim(),
        cartItems.map((i) => ({ skuId: i.skuId, quantity: i.quantity })),
      );
      setValidatedCoupon({
        code: res.coupon.code,
        discountAmount: res.discountAmount,
        qualifyingSubtotal: res.qualifyingSubtotal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCouponError(msg || 'Coupon validation failed');
      setValidatedCoupon(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleProceedToCheckout = () => {
    // Store token and validated coupon in sessionStorage before navigation
    if (buyerToken) {
      sessionStorage.setItem('luxe_buyer_token', buyerToken);
    }
    if (validatedCoupon) {
      sessionStorage.setItem('luxe_coupon_code', validatedCoupon.code);
    }
    router.push('/checkout');
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px', minHeight: '80vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Shopping Bag</h1>
        <Link href="/products" className="btn btn-secondary btn-sm">
          ← Continue Shopping
        </Link>
      </div>

      {cartItems.length === 0 ? (
        <div className="glass-panel" style={{ padding: '64px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>Your Shopping Bag is empty</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Explore our curated catalog to add products to your bag.
          </p>
          <Link href="/products" className="btn btn-primary">
            Explore Catalog
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '32px' }}>
          {/* Cart Item List */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Quantity</th>
                    <th>Subtotal</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => {
                    const itemSubtotal = BigInt(item.pricePaise || 0) * BigInt(item.quantity);
                    return (
                      <tr key={item.skuId}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt=""
                                style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover' }}
                              />
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.productName}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                SKU: {item.skuCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{formatRupees(item.pricePaise)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => updateQuantity(item.skuId, item.quantity - 1)}
                              className="btn btn-secondary btn-sm"
                              style={{ width: '28px', height: '28px', padding: 0 }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.skuId, item.quantity + 1)}
                              className="btn btn-secondary btn-sm"
                              style={{ width: '28px', height: '28px', padding: 0 }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatRupees(itemSubtotal.toString())}</td>
                        <td>
                          <button
                            onClick={() => removeFromCart(item.skuId)}
                            style={{ background: 'none', border: 'none', color: 'var(--status-danger-text)', cursor: 'pointer', fontSize: '0.875rem' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cart Summary & Coupon Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Token Input Bar */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <label className="form-label">Buyer JWT Authentication</label>
              <input
                type="password"
                className="form-input"
                placeholder="Paste Buyer JWT Token for checkout..."
                value={buyerToken}
                onChange={(e) => setBuyerToken(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                Required to validate coupons & initialize checkout session.
              </span>
            </div>

            {/* Coupon Discount Preview */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px' }}>Have a Coupon?</h4>
              <form onSubmit={handleValidateCoupon} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Coupon code..."
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  style={{ textTransform: 'uppercase' }}
                />
                <button type="submit" className="btn btn-secondary" disabled={isValidating || !couponCode.trim()}>
                  {isValidating ? '...' : 'Apply'}
                </button>
              </form>

              {couponError && (
                <p style={{ color: 'var(--status-danger-text)', fontSize: '0.75rem', marginTop: '8px' }}>
                  {couponError}
                </p>
              )}

              {validatedCoupon && (
                <div style={{ marginTop: '12px', padding: '10px', backgroundColor: 'var(--status-success-bg)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: '6px', fontSize: '0.8125rem', color: 'var(--status-success-text)' }}>
                  ✓ Coupon <strong>{validatedCoupon.code}</strong> applied! Discount: {formatRupees(validatedCoupon.discountAmount)}
                </div>
              )}
            </div>

            {/* Order Summary */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Order Summary</h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Bag Subtotal</span>
                <span style={{ fontWeight: 600 }}>{formatRupees(subtotalPaise.toString())}</span>
              </div>

              {discountPaise > 0n && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.875rem', color: 'var(--status-success-text)' }}>
                  <span>Coupon Discount</span>
                  <span>- {formatRupees(discountPaise.toString())}</span>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800 }}>
                <span>Estimated Total</span>
                <span>{formatRupees(estimatedTotalPaise.toString())}</span>
              </div>

              <button
                onClick={handleProceedToCheckout}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '24px', padding: '14px', fontSize: '1rem' }}
                disabled={cartItems.length === 0}
              >
                Proceed to Checkout →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
