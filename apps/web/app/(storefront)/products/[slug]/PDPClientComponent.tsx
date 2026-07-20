'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react';
import { ProductDetail, SkuItem, formatRupees, trackProductView } from '../../../lib/storefront-client';

interface PDPClientComponentProps {
  product: ProductDetail;
}

export function PDPClientComponent({ product }: PDPClientComponentProps) {
  const primaryVariant = product.variants?.[0];
  const [selectedVariant, setSelectedVariant] = useState(primaryVariant);
  const [selectedSku, setSelectedSku] = useState<SkuItem | undefined>(primaryVariant?.skus?.[0]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Fire-and-forget view tracking on mount
  useEffect(() => {
    if (product.id) {
      trackProductView(product.id);
    }
  }, [product.id]);

  const images = selectedVariant?.images || [
    { url: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80', isPrimary: true },
  ];

  const currentPricePaise = selectedSku?.price || primaryVariant?.skus?.[0]?.price || '0';
  const currentQuantity = selectedSku?.quantity !== undefined ? selectedSku.quantity : 10;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 1fr)', gap: '40px' }}>
      {/* Image Gallery */}
      <div>
        <div className="glass-panel" style={{ width: '100%', paddingTop: '100%', position: 'relative', overflow: 'hidden', borderRadius: '16px' }}>
          <img
            src={images[selectedImageIndex]?.url || images[0]?.url}
            alt={product.name}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        {images.length > 1 && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', overflowX: 'auto' }}>
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedImageIndex(idx)}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: selectedImageIndex === idx ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  padding: 0,
                  cursor: 'pointer',
                  background: 'none',
                }}
              >
                <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Information & SKU Selector */}
      <div>
        <div style={{ marginBottom: '16px' }}>
          {product.brand && (
            <span className="badge badge-info" style={{ marginBottom: '8px' }}>
              {product.brand.name}
            </span>
          )}
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            {product.name}
          </h1>
          {product.category && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Category: {product.category.name}
            </p>
          )}
        </div>

        {/* Rating & Stock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          {product.averageRating !== undefined && product.averageRating > 0 && (
            <span className="badge badge-warning">
              ★ {product.averageRating.toFixed(1)} ({product.totalReviews || 0} reviews)
            </span>
          )}
          <span className={`badge ${currentQuantity > 0 ? 'badge-success' : 'badge-danger'}`}>
            {currentQuantity > 0 ? `In Stock (${currentQuantity} available)` : 'Out of Stock'}
          </span>
        </div>

        {/* Price Display */}
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>
          {formatRupees(currentPricePaise)}
        </div>

        {/* Variant Selector */}
        {product.variants && product.variants.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <label className="form-label">Variant</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {product.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => {
                    setSelectedVariant(variant);
                    setSelectedSku(variant.skus?.[0]);
                    setSelectedImageIndex(0);
                  }}
                  className={`btn ${selectedVariant?.id === variant.id ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {variant.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SKU Selector (Size / Options) */}
        {selectedVariant?.skus && selectedVariant.skus.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <label className="form-label">SKU / Size Option</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {selectedVariant.skus.map((sku) => (
                <button
                  key={sku.id}
                  onClick={() => setSelectedSku(sku)}
                  className={`btn ${selectedSku?.id === sku.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8125rem' }}
                >
                  {sku.skuCode} ({formatRupees(sku.price)})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add to Cart CTA Placeholder */}
        <div style={{ marginTop: '32px' }}>
          <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1rem' }}>
            Add to Bag — {formatRupees(currentPricePaise)}
          </button>
        </div>

        {/* Description */}
        <div style={{ marginTop: '32px', borderTop: '1px solid var(--border-subtle)', paddingTop: '24px' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>Description & Details</h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {product.description || 'No description provided for this product.'}
          </p>
        </div>
      </div>
    </div>
  );
}
