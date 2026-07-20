import Link from 'next/link';
import { Navbar } from '../../components/storefront/Navbar';
import { Footer } from '../../components/storefront/Footer';
import { ProductCard } from '../../components/storefront/ProductCard';
import { fetchCategories, searchProducts } from '../../lib/storefront-client';

interface PLPPageProps {
  searchParams: Promise<{
    q?: string;
    categoryId?: string;
    brandId?: string;
    minPrice?: string;
    maxPrice?: string;
    page?: string;
  }>;
}

export default async function ProductListingPage({ searchParams }: PLPPageProps) {
  const resolvedParams = await searchParams;
  const q = resolvedParams.q || undefined;
  const categoryId = resolvedParams.categoryId || undefined;
  const minPrice = resolvedParams.minPrice ? Number(resolvedParams.minPrice) : undefined;
  const maxPrice = resolvedParams.maxPrice ? Number(resolvedParams.maxPrice) : undefined;
  const page = resolvedParams.page ? Number(resolvedParams.page) : 1;

  const [categories, searchResult] = await Promise.all([
    fetchCategories(),
    searchProducts({ q, categoryId, minPrice, maxPrice, page, limit: 12 }),
  ]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar categories={categories} />

      <main style={{ flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            {q ? `Search Results for "${q}"` : 'All Products'}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Showing {searchResult.items.length} of {searchResult.total} live products
          </p>
        </div>

        {/* Content Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '32px' }}>
          {/* Sidebar Filters */}
          <aside className="glass-panel" style={{ padding: '20px', height: 'fit-content' }}>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Filter By Category
            </h4>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '10px', fontSize: '0.875rem' }}>
              <li>
                <Link
                  href="/products"
                  style={{ color: !categoryId ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: !categoryId ? 700 : 400 }}
                >
                  All Categories
                </Link>
              </li>
              {categories.map((cat) => (
                <li key={cat.id}>
                  <Link
                    href={`/products?categoryId=${cat.id}`}
                    style={{ color: categoryId === cat.id ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: categoryId === cat.id ? 700 : 400 }}
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          {/* Product Grid */}
          <div>
            {searchResult.items.length === 0 ? (
              <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <h3>No live products found matching your search.</h3>
                <p style={{ marginTop: '8px' }}>Try broadening your search term or clearing category filters.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                {searchResult.items.map((prod) => (
                  <ProductCard key={prod.id} product={prod} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
