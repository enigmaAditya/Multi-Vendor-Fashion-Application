import React from 'react';
import { Navbar } from '../components/storefront/Navbar';
import { Footer } from '../components/storefront/Footer';
import { ProductCard } from '../components/storefront/ProductCard';
import { RecommendationCarousel } from '../components/storefront/RecommendationCarousel';
import { fetchCategories, fetchTrendingProducts, searchProducts } from '../lib/storefront-client';

export const revalidate = 60; // SSR with revalidation

export default async function StorefrontHomePage() {
  const [categories, trending, catalog] = await Promise.all([
    fetchCategories(),
    fetchTrendingProducts(8),
    searchProducts({ limit: 8 }),
  ]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar categories={categories} />

      <main style={{ flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {/* Hero Section */}
        <section className="glass-panel" style={{ padding: '48px 32px', marginBottom: '48px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ maxWidth: '640px', position: 'relative', zIndex: 2 }}>
            <span className="badge badge-info" style={{ marginBottom: '12px' }}>
              AUTUMN / WINTER 2026
            </span>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.15, marginBottom: '16px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Discover Exceptional Fashion & Independent Brands
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Explore curated luxury apparel, artisanal outerwear, and exclusive streetwear direct from verified sellers.
            </p>
          </div>
        </section>

        {/* Featured Categories Grid */}
        {categories.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px' }}>Explore Categories</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
              {categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`/products?categoryId=${cat.id}`}
                  className="glass-panel"
                  style={{ padding: '20px', textDecoration: 'none', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cat.name}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Trending Products Carousel */}
        <RecommendationCarousel
          title="Trending Now"
          subtitle="Top rated & highest velocity products across all categories"
          products={trending}
        />

        {/* Catalog Highlights */}
        {(catalog?.items?.length ?? 0) > 0 && (
          <section style={{ marginTop: '48px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px' }}>New Arrivals</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
              {catalog.items.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
