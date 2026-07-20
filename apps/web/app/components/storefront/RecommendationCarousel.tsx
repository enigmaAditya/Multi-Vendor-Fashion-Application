import React from 'react';
import { SearchProductCard } from '../../lib/storefront-client';
import { ProductCard } from './ProductCard';

interface RecommendationCarouselProps {
  title: string;
  subtitle?: string;
  products: SearchProductCard[];
}

export function RecommendationCarousel({ title, subtitle, products }: RecommendationCarouselProps) {
  if (!products || products.length === 0) return null;

  return (
    <section style={{ marginTop: '48px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
        {subtitle && <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
        {products.slice(0, 8).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
