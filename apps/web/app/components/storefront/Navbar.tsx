'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CategoryNode } from '../../lib/storefront-client';

interface NavbarProps {
  categories?: CategoryNode[];
}

export function Navbar({ categories = [] }: NavbarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/products');
    }
  };

  return (
    <header className="glass-panel" style={{ borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            LUXE MARKET
          </h1>
        </Link>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 320px', maxWidth: '520px', position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search fashion, apparel, brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ borderRadius: '9999px', paddingLeft: '20px', paddingRight: '90px' }}
          />
          <button type="submit" className="btn btn-primary btn-sm" style={{ position: 'absolute', right: '4px', top: '4px', bottom: '4px', borderRadius: '9999px' }}>
            Search
          </button>
        </form>

        {/* Navigation Links & Actions */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/products" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            All Products
          </Link>
          <Link href="/admin" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
            Operator Portal
          </Link>
        </nav>
      </div>

      {/* Categories Bar */}
      {categories.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '10px 24px', display: 'flex', gap: '24px', overflowX: 'auto' }}>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/products?categoryId=${cat.id}`}
                style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
