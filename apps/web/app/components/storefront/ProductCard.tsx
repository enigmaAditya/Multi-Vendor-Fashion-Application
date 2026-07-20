/* eslint-disable @next/next/no-img-element */
import React from 'react';
import Link from 'next/link';
import { SearchProductCard, formatRupees } from '../../lib/storefront-client';

interface ProductCardProps {
  product: SearchProductCard;
}

export function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.imageUrl || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80';

  return (
    <Link href={`/products/${product.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div className="glass-panel" style={{ height: '100%', overflow: 'hidden', transition: 'transform 0.2s ease, border-color 0.2s ease', display: 'flex', flexDirection: 'column' }}>
        {/* Product Thumbnail */}
        <div style={{ width: '100%', paddingTop: '100%', position: 'relative', backgroundColor: '#1a202c', overflow: 'hidden' }}>
          <img
            src={imageUrl}
            alt={product.name}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {product.brandName && (
            <span className="badge badge-info" style={{ position: 'absolute', top: '10px', left: '10px', backdropFilter: 'blur(8px)' }}>
              {product.brandName}
            </span>
          )}
        </div>

        {/* Product Details */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {product.name}
            </h4>
            {product.categoryName && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {product.categoryName}
              </p>
            )}
          </div>

          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatRupees(product.pricePaise)}
            </div>
            {product.averageRating !== undefined && product.averageRating > 0 && (
              <span className="badge badge-warning">
                ★ {product.averageRating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
