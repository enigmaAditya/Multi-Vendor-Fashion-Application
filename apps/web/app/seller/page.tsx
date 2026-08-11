'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  linkPayoutAccount,
  fetchMyPayouts,
  createSellerProduct,
  submitProductForReview,
  addInventoryStock,
  fetchSellerOrders,
  dispatchSubOrderShipment,
  SellerSubOrder,
} from '../lib/seller-client';
import { formatRupees, fetchCategories, CategoryNode } from '../lib/storefront-client';

interface SellerPayout {
  id: string;
  subOrderId: string;
  grossAmount: string;
  commissionAmount: string;
  netAmount: string;
  status: string;
  createdAt: string;
}

export default function SellerPortalPage() {
  const [sellerToken, setSellerToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'catalog' | 'inventory' | 'orders' | 'payouts'>('overview');

  // Global Alerts
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  // State: Data Arrays
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [sellerOrders, setSellerOrders] = useState<SellerSubOrder[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);

  // Form State: Catalog Creator
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [variantColor, setVariantColor] = useState('Default');
  const [imageUrl, setImageUrl] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [skuSize, setSkuSize] = useState('M');
  const [skuPrice, setSkuPrice] = useState(1499);
  const [skuMrp, setSkuMrp] = useState(1999);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);

  // Form State: Inventory Replenishment
  const [skuIdInput, setSkuIdInput] = useState('');
  const [warehouseIdInput, setWarehouseIdInput] = useState('');
  const [stockDeltaInput, setStockDeltaInput] = useState(50);

  // Form State: Payout Account
  const [gatewayAccountIdInput, setGatewayAccountIdInput] = useState('');

  const loadSellerData = useCallback(async (token: string) => {
    try {
      setAlertError(null);
      const [payoutRes, ordersRes, catRes] = await Promise.all([
        fetchMyPayouts(token).catch(() => ({ payouts: [] })),
        fetchSellerOrders(token).catch(() => ({ subOrders: [] })),
        fetchCategories().catch(() => []),
      ]);
      setPayouts(payoutRes.payouts || []);
      setSellerOrders(ordersRes.subOrders || []);
      setCategories(catRes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertError(msg || 'Failed to load seller portal data');
    }
  }, []);

  useEffect(() => {
    const token =
      sessionStorage.getItem('luxe_seller_token') ||
      sessionStorage.getItem('luxe_buyer_token') ||
      localStorage.getItem('luxe_seller_token') ||
      localStorage.getItem('luxe_buyer_token');
    if (token) {
      setSellerToken(token);
      loadSellerData(token);
    }
  }, [loadSellerData]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerToken) return;

    if (skuMrp < skuPrice) {
      setAlertError('MRP must be greater than or equal to Price.');
      return;
    }

    try {
      setAlertError(null);
      setAlertSuccess(null);
      const res = await createSellerProduct(sellerToken, {
        name: productName,
        description: productDesc || undefined,
        categoryId: selectedCategoryId || undefined,
        brandId: selectedBrandId || undefined,
        variants: [
          {
            color: variantColor || 'Default',
            images: [
              {
                url: imageUrl || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500&auto=format&fit=crop',
                isPrimary: true,
              },
            ],
            skus: [
              {
                skuCode: skuCode || `SKU-${Date.now()}`,
                size: skuSize || 'Free Size',
                price: Number(skuPrice),
                mrp: Number(skuMrp),
              },
            ],
          },
        ],
      });
      setCreatedProductId(res.product.id);
      setAlertSuccess(`✓ Product "${res.product.name}" created (ID: ${res.product.id})! Ready to submit for review.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertError(msg || 'Failed to create product');
    }
  };

  const handleSubmitProduct = async () => {
    if (!sellerToken || !createdProductId) return;
    try {
      setAlertError(null);
      setAlertSuccess(null);
      const res = await submitProductForReview(sellerToken, createdProductId);
      setAlertSuccess(`✓ Product ${res.product.id} submitted for admin review! Status: ${res.product.status}`);
      setCreatedProductId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertError(msg || 'Failed to submit product');
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerToken) return;
    try {
      setAlertError(null);
      setAlertSuccess(null);
      const res = await addInventoryStock(sellerToken, {
        skuId: skuIdInput,
        warehouseId: warehouseIdInput,
        quantityDelta: Number(stockDeltaInput),
        reason: 'Seller Merchant Replenishment',
      });
      setAlertSuccess(`✓ Stock replenished! SKU ${res.skuId} now has ${res.onHand} units on hand.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertError(msg || 'Failed to add inventory stock');
    }
  };

  const handleDispatchShipment = async (subOrderId: string) => {
    if (!sellerToken) return;
    try {
      setAlertError(null);
      setAlertSuccess(null);
      const res = await dispatchSubOrderShipment(sellerToken, subOrderId);
      setAlertSuccess(`✓ Shipment dispatched for sub-order ${subOrderId}! AWB Code: ${res.awbCode || 'Generated'}`);
      loadSellerData(sellerToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertError(msg || 'Failed to dispatch shipment');
    }
  };

  const handleLinkPayoutAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerToken) return;
    try {
      setAlertError(null);
      setAlertSuccess(null);
      const res = await linkPayoutAccount(sellerToken, gatewayAccountIdInput);
      setAlertSuccess(`✓ Razorpay Route Account linked! ID: ${res.gatewayAccountId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertError(msg || 'Failed to link payout account');
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px', minHeight: '85vh' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Seller Merchant Portal</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Multi-vendor merchant control center for catalog, stock, fulfillment, and payouts.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary btn-sm">
          ← Back to Storefront
        </Link>
      </div>

      {!sellerToken ? (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', margin: '32px 0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>Seller Authentication Required</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '480px', margin: '0 auto 24px' }}>
            Please log in with your Seller account credentials to access the Seller Portal, manage catalog products, track shipments, and view payouts.
          </p>
          <Link href="/login?redirect=/seller" className="btn btn-primary">
            Log In to Seller Portal →
          </Link>
        </div>
      ) : (
        <>
          {/* Global Alerts */}
          {alertError && <div className="alert alert-danger" style={{ marginBottom: '20px' }}>{alertError}</div>}
          {alertSuccess && <div className="alert alert-success" style={{ marginBottom: '20px' }}>{alertSuccess}</div>}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
        {(['overview', 'catalog', 'inventory', 'orders', 'payouts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 18px',
              fontSize: '0.875rem',
              fontWeight: 700,
              background: activeTab === tab ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <span className="metric-label">Assigned Sub-Orders</span>
            <div className="metric-value">{sellerOrders.length}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ready for fulfillment</span>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <span className="metric-label">Settled Payouts</span>
            <div className="metric-value">{payouts.length}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Razorpay Route transfers</span>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <span className="metric-label">Net Earnings</span>
            <div className="metric-value">
              {formatRupees(
                payouts
                  .reduce((acc, p) => acc + BigInt(p.netAmount || 0), 0n)
                  .toString(),
              )}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>After platform commissions</span>
          </div>
        </div>
      )}

      {/* TAB 2: CATALOG CREATOR */}
      {activeTab === 'catalog' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Create New Fashion Product</h3>
            <form onSubmit={handleCreateProduct}>
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Classic Linen Casual Shirt"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="100% breathable organic cotton linen..."
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <select
                    className="form-input"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    required
                  >
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Brand ID (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Paste Brand UUID..."
                    value={selectedBrandId}
                    onChange={(e) => setSelectedBrandId(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginTop: '16px', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px', color: 'var(--accent-primary)' }}>Initial Variant & SKU</h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Variant Color</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Navy Blue"
                      value={variantColor}
                      onChange={(e) => setVariantColor(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Variant Image URL</label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SKU Code</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. LNE-NVY-M"
                      value={skuCode}
                      onChange={(e) => setSkuCode(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Size</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. M"
                      value={skuSize}
                      onChange={(e) => setSkuSize(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Selling Price (Paise/Rs)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={skuPrice}
                      onChange={(e) => setSkuPrice(Number(e.target.value))}
                      min={0}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">MRP (Paise/Rs)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={skuMrp}
                      onChange={(e) => setSkuMrp(Number(e.target.value))}
                      min={0}
                      required
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '12px' }}>
                Create Draft Product
              </button>
            </form>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '12px' }}>Moderation Submission</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Products remain in DRAFT status until submitted for Admin catalog review.
            </p>

            {createdProductId ? (
              <div style={{ background: 'var(--bg-glass-element)', padding: '16px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>
                  Draft Product ID: <code>{createdProductId}</code>
                </div>
                <button onClick={handleSubmitProduct} className="btn btn-success" style={{ width: '100%' }}>
                  Submit Product for Admin Review →
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Create a product draft first to trigger moderation submission.
              </span>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INVENTORY REPLENISHMENT */}
      {activeTab === 'inventory' && (
        <div className="glass-panel" style={{ padding: '24px', maxWidth: '640px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Replenish Warehouse Stock</h3>
          <form onSubmit={handleAddStock}>
            <div className="form-group">
              <label className="form-label">Target SKU ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="Paste SKU ID..."
                value={skuIdInput}
                onChange={(e) => setSkuIdInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Warehouse ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="Paste Warehouse ID..."
                value={warehouseIdInput}
                onChange={(e) => setWarehouseIdInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quantity Delta (Units to Add)</label>
              <input
                type="number"
                className="form-input"
                value={stockDeltaInput}
                onChange={(e) => setStockDeltaInput(Number(e.target.value))}
                min={1}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '12px' }}>
              Add Stock to Warehouse
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: ORDERS & FULFILLMENT */}
      {activeTab === 'orders' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Incoming Sub-Orders Queue</h3>
          {sellerOrders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No sub-orders assigned to your merchant account.</p>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sub-Order ID</th>
                    <th>Order Total</th>
                    <th>Payment Status</th>
                    <th>Shipment Status</th>
                    <th>AWB Code</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerOrders.map((so) => (
                    <tr key={so.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{so.id}</td>
                      <td>{formatRupees(so.amount)}</td>
                      <td>
                        <span className="badge badge-success">{so.status}</span>
                      </td>
                      <td>
                        <span className="badge badge-warning">{so.shipmentStatus || 'PENDING_SYNC'}</span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{so.awbCode || 'Unassigned'}</td>
                      <td>
                        <button
                          onClick={() => handleDispatchShipment(so.id)}
                          className="btn btn-primary btn-sm"
                        >
                          Dispatch Shipment →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PAYOUTS & BANK ACCOUNT */}
      {activeTab === 'payouts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Settled Payout Ledger</h3>
            {payouts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No payouts recorded yet.</p>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sub-Order</th>
                      <th>Gross</th>
                      <th>Commission</th>
                      <th>Net Payout</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace' }}>{p.subOrderId}</td>
                        <td>{formatRupees(p.grossAmount)}</td>
                        <td style={{ color: 'var(--status-danger-text)' }}>- {formatRupees(p.commissionAmount)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--status-success-text)' }}>{formatRupees(p.netAmount)}</td>
                        <td>
                          <span className="badge badge-success">{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '12px' }}>Link Bank / Payout Account</h3>
            <form onSubmit={handleLinkPayoutAccount}>
              <div className="form-group">
                <label className="form-label">Razorpay Route Account ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. acc_123456789"
                  value={gatewayAccountIdInput}
                  onChange={(e) => setGatewayAccountIdInput(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                Link Gateway Account
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )}
</div>
  );
}
