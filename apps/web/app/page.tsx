'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchFinancialSummary,
  fetchSellers,
  approveSellerKyc,
  fetchModerationQueue,
  moderateProduct,
  moderateReview,
  setCommissionRule,
  formatRupees,
  FinancialSummaryResponse,
  SellerRecord,
  ProductModerationItem,
} from './lib/admin-client';

type TabType = 'overview' | 'sellers' | 'catalog' | 'reviews' | 'commissions' | 'finance';

export default function AdminDashboardPage() {
  const [adminToken, setAdminToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Financial State
  const [finance, setFinance] = useState<FinancialSummaryResponse | null>(null);

  // Sellers State
  const [sellers, setSellers] = useState<SellerRecord[]>([]);
  const [sellerKycFilter, setSellerKycFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [selectedSeller, setSelectedSeller] = useState<SellerRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Catalog Moderation State
  const [pendingProducts, setPendingProducts] = useState<ProductModerationItem[]>([]);

  // Review Moderation State
  const [reviewIdInput, setReviewIdInput] = useState<string>('');

  // Commission Rule State
  const [commCategoryId, setCommCategoryId] = useState<string>('');
  const [commSellerId, setCommSellerId] = useState<string>('');
  const [commRatePercent, setCommRatePercent] = useState<string>('5');

  // Utility to clear alerts
  const clearAlerts = () => {
    setErrorAlert(null);
    setSuccessAlert(null);
  };

  // 1. Fetch Finance Summary
  const loadFinanceSummary = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoading(true);
      clearAlerts();
      const data = await fetchFinancialSummary(adminToken);
      setFinance(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(msg || 'Failed to fetch financial summary.');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  // 2. Fetch Sellers
  const loadSellers = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoading(true);
      clearAlerts();
      const kycStatusParam = sellerKycFilter === 'ALL' ? undefined : sellerKycFilter;
      const data = await fetchSellers(adminToken, kycStatusParam);
      setSellers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(msg || 'Failed to fetch sellers list.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, sellerKycFilter]);

  // 3. Fetch Catalog Moderation Queue
  const loadCatalogQueue = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoading(true);
      clearAlerts();
      const data = await fetchModerationQueue(adminToken);
      setPendingProducts(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(msg || 'Failed to fetch catalog moderation queue.');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  // Data Loading Trigger based on Active Tab
  useEffect(() => {
    if (!adminToken) return;
    if (activeTab === 'overview' || activeTab === 'finance') {
      loadFinanceSummary();
    }
    if (activeTab === 'sellers') {
      loadSellers();
    }
    if (activeTab === 'catalog') {
      loadCatalogQueue();
    }
  }, [adminToken, activeTab, sellerKycFilter, loadFinanceSummary, loadSellers, loadCatalogQueue]);

  // Handlers for Operator Actions (Server Truth Response)
  const handleApproveSellerKyc = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedSeller || !adminToken) return;
    try {
      clearAlerts();
      setLoading(true);
      const res = await approveSellerKyc(adminToken, selectedSeller.id, status, rejectionReason);
      setSuccessAlert(`Seller KYC updated successfully to ${res.status}.`);
      setSelectedSeller(null);
      setRejectionReason('');
      await loadSellers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(`KYC Action Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleModerateProduct = async (productId: string, status: 'LIVE' | 'REJECTED' | 'SUSPENDED') => {
    if (!adminToken) return;
    try {
      clearAlerts();
      setLoading(true);
      const res = await moderateProduct(adminToken, productId, status);
      setSuccessAlert(`Product ${res.id} status updated to ${res.status}.`);
      await loadCatalogQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(`Catalog Moderation Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleModerateReview = async (status: 'APPROVED' | 'REJECTED') => {
    if (!adminToken || !reviewIdInput) return;
    try {
      clearAlerts();
      setLoading(true);
      const res = await moderateReview(adminToken, reviewIdInput, status);
      setSuccessAlert(`Review ${res.id} status updated to ${res.status}.`);
      setReviewIdInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(`Review Moderation Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetCommissionRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    try {
      clearAlerts();
      setLoading(true);
      const rate = parseFloat(commRatePercent);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new Error('Commission rate must be between 0 and 100%.');
      }
      await setCommissionRule(adminToken, {
        categoryId: commCategoryId || undefined,
        sellerId: commSellerId || undefined,
        ratePercent: rate,
      });
      setSuccessAlert('Commission rule updated successfully.');
      setCommCategoryId('');
      setCommSellerId('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorAlert(`Commission Update Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header Bar */}
      <header
        className="glass-panel"
        style={{
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Operator Control Surface
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Multi-Vendor Marketplace Admin Panel
          </p>
        </div>

        {/* Token Setter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="password"
            className="form-input"
            placeholder="Paste Admin JWT Token..."
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            style={{ width: '280px', padding: '8px 12px' }}
          />
          <span className={`badge ${adminToken ? 'badge-success' : 'badge-warning'}`}>
            {adminToken ? 'Authenticated' : 'Token Required'}
          </span>
        </div>
      </header>

      {/* Global Alerts */}
      {errorAlert && (
        <div className="alert alert-danger">
          <span>{errorAlert}</span>
          <button
            onClick={() => setErrorAlert(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {successAlert && (
        <div className="alert alert-success">
          <span>{successAlert}</span>
          <button
            onClick={() => setSuccessAlert(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px',
          overflowX: 'auto',
        }}
      >
        {(
          [
            ['overview', 'Overview'],
            ['sellers', 'Seller KYC'],
            ['catalog', 'Catalog Queue'],
            ['reviews', 'Review Moderation'],
            ['commissions', 'Commission Rules'],
            ['finance', 'Financial Ledgers'],
          ] as [TabType, string][]
        ).map(([tabKey, tabLabel]) => (
          <button
            key={tabKey}
            onClick={() => {
              clearAlerts();
              setActiveTab(tabKey);
            }}
            className={`btn ${activeTab === tabKey ? 'btn-primary' : 'btn-secondary'}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {tabLabel}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <main>
        {/* 1. Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Gross Merchandise Value</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--text-primary)' }}>
                  {finance ? formatRupees(finance.gmv) : '₹0.00'}
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Platform Commission</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--status-success-text)' }}>
                  {finance ? formatRupees(finance.totalCommission) : '₹0.00'}
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Settled Payouts</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--status-info-text)' }}>
                  {finance ? formatRupees(finance.totalPayouts) : '₹0.00'}
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Platform Promo Expenses</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--status-warning-text)' }}>
                  {finance ? formatRupees(finance.platformPromoExpenses) : '₹0.00'}
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>System Operator Controls</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Select a tab above to manage seller onboarding KYC approvals, catalog moderation queues, review moderation, custom commission rules, or inspect real-time financial ledger aggregations.
              </p>
            </div>
          </div>
        )}

        {/* 2. Seller KYC Verification Tab */}
        {activeTab === 'sellers' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Seller KYC Verification</h2>

              {/* Status Filter */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setSellerKycFilter(status)}
                    className={`btn btn-sm ${sellerKycFilter === status ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading sellers...</p>}

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Seller ID</th>
                    <th>Phone</th>
                    <th>Joined</th>
                    <th>KYC Status</th>
                    <th>Gateway Account ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No sellers found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    sellers.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace' }}>{s.id}</td>
                        <td>{s.phone}</td>
                        <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span
                            className={`badge ${
                              s.linkedAccount?.status === 'ACTIVE'
                                ? 'badge-success'
                                : s.linkedAccount?.status === 'SUSPENDED'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {s.linkedAccount?.status || 'PENDING'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>
                          {s.linkedAccount?.gatewayAccountId || 'N/A'}
                        </td>
                        <td>
                          <button
                            onClick={() => setSelectedSeller(s)}
                            className="btn btn-secondary btn-sm"
                          >
                            Manage KYC
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* KYC Action Modal */}
            {selectedSeller && (
              <div className="modal-overlay">
                <div className="glass-panel modal-content">
                  <h3 style={{ marginBottom: '16px' }}>Manage Seller KYC</h3>
                  <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                    <strong>Seller ID:</strong> {selectedSeller.id}
                  </p>
                  <p style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
                    <strong>Phone:</strong> {selectedSeller.phone}
                  </p>

                  <div className="form-group">
                    <label className="form-label">Rejection Reason (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Invalid GSTIN or bank document"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button
                      onClick={() => setSelectedSeller(null)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleApproveSellerKyc('REJECTED')}
                      className="btn btn-danger"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveSellerKyc('APPROVED')}
                      className="btn btn-primary"
                    >
                      Approve (Set Active)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Catalog Moderation Queue Tab */}
        {activeTab === 'catalog' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '20px' }}>Catalog Moderation Queue</h2>

            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading moderation queue...</p>}

            {pendingProducts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No products currently pending moderation.</p>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {pendingProducts.map((p) => (
                  <div
                    key={p.id}
                    className="glass-panel"
                    style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{p.name}</h4>
                        <span className="badge badge-warning">{p.status}</span>
                      </div>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Slug: {p.slug} | Category: {p.category?.name || 'N/A'} | Seller: {p.seller?.phone || p.seller?.id}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleModerateProduct(p.id, 'LIVE')}
                        className="btn btn-primary btn-sm"
                      >
                        Approve (LIVE)
                      </button>
                      <button
                        onClick={() => handleModerateProduct(p.id, 'REJECTED')}
                        className="btn btn-secondary btn-sm"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleModerateProduct(p.id, 'SUSPENDED')}
                        className="btn btn-danger btn-sm"
                      >
                        Suspend
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Review Moderation Queue Tab */}
        {activeTab === 'reviews' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '20px' }}>Review Moderation Control</h2>

            <div style={{ maxWidth: '480px' }}>
              <div className="form-group">
                <label className="form-label">Review ID to Moderate</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Paste Review UUID..."
                  value={reviewIdInput}
                  onChange={(e) => setReviewIdInput(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={() => handleModerateReview('APPROVED')}
                  className="btn btn-primary"
                  disabled={!reviewIdInput}
                >
                  Approve Review
                </button>
                <button
                  onClick={() => handleModerateReview('REJECTED')}
                  className="btn btn-danger"
                  disabled={!reviewIdInput}
                >
                  Reject & Hide Review
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. Commission Rules Configurator Tab */}
        {activeTab === 'commissions' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '20px' }}>Commission Rules Configurator</h2>

            <form onSubmit={handleSetCommissionRule} style={{ maxWidth: '480px' }}>
              <div className="form-group">
                <label className="form-label">Category ID (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Category UUID for category override..."
                  value={commCategoryId}
                  onChange={(e) => setCommCategoryId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Seller ID (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Seller User UUID for seller override..."
                  value={commSellerId}
                  onChange={(e) => setCommSellerId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Commission Rate Percent (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="form-input"
                  value={commRatePercent}
                  onChange={(e) => setCommRatePercent(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }}>
                Save Commission Rule
              </button>
            </form>
          </div>
        )}

        {/* 6. Financial Ledgers Tab */}
        {activeTab === 'finance' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '20px' }}>Financial Ledger Aggregations</h2>

            {loading && <p style={{ color: 'var(--text-muted)' }}>Calculating ledger metrics...</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Gross Merchandise Value (GMV)</h4>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px' }}>
                  {finance ? formatRupees(finance.gmv) : '₹0.00'}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aggregated from all SubOrders</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Platform Commission Earned</h4>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--status-success-text)' }}>
                  {finance ? formatRupees(finance.totalCommission) : '₹0.00'}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aggregated from CommissionLedger</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Settled Seller Payouts</h4>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--status-info-text)' }}>
                  {finance ? formatRupees(finance.totalPayouts) : '₹0.00'}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aggregated from Settled Payouts</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Platform Promo Expenses</h4>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '8px', color: 'var(--status-warning-text)' }}>
                  {finance ? formatRupees(finance.platformPromoExpenses) : '₹0.00'}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aggregated from PromotionLedger</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
