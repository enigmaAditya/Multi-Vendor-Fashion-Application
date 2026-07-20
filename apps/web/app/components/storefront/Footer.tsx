import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="glass-panel" style={{ borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', marginTop: '64px', padding: '48px 24px 24px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '32px', marginBottom: '32px' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            LUXE MARKET
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Premier Multi-Vendor Fashion & Lifestyle Marketplace powered by Microservices Architecture.
          </p>
        </div>

        <div>
          <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Shop & Discover
          </h4>
          <ul style={{ listStyle: 'none', display: 'grid', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <li><Link href="/products">All Catalog Products</Link></li>
            <li><Link href="/products?sort=trending">Trending Fashion</Link></li>
          </ul>
        </div>

        <div>
          <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Platform Controls
          </h4>
          <ul style={{ listStyle: 'none', display: 'grid', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <li><Link href="/admin">Operator Admin Panel</Link></li>
          </ul>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', textAlign: 'center', paddingTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} Luxe Market. All rights reserved. Multi-Vendor Platform Architecture.
      </div>
    </footer>
  );
}
