import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Navbar } from '../../../components/storefront/Navbar';
import { Footer } from '../../../components/storefront/Footer';
import { PDPClientComponent } from './PDPClientComponent';
import { RecommendationCarousel } from '../../../components/storefront/RecommendationCarousel';
import {
  fetchCategories,
  fetchProductBySlug,
  fetchSimilarProducts,
  fetchAlsoBought,
  formatRupees,
} from '../../../lib/storefront-client';

interface PDPPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PDPPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const product = await fetchProductBySlug(resolvedParams.slug);

  if (!product) {
    return {
      title: 'Product Not Found | Luxe Market',
      description: 'The requested product could not be found.',
    };
  }

  const primaryVariant = product.variants?.[0];
  const pricePaise = primaryVariant?.skus?.[0]?.price || '0';
  const priceFormatted = formatRupees(pricePaise);

  return {
    title: `${product.name} — ${priceFormatted} | Luxe Market`,
    description: product.description?.slice(0, 160) || `Buy ${product.name} on Luxe Market.`,
    openGraph: {
      title: product.name,
      description: product.description,
      images: primaryVariant?.images?.[0]?.url ? [{ url: primaryVariant.images[0].url }] : [],
    },
  };
}

export default async function ProductDetailPage({ params }: PDPPageProps) {
  const resolvedParams = await params;
  const product = await fetchProductBySlug(resolvedParams.slug);

  if (!product) {
    notFound();
  }

  const [categories, similar, alsoBought] = await Promise.all([
    fetchCategories(),
    fetchSimilarProducts(product.id, 8),
    fetchAlsoBought(product.id, 8),
  ]);

  const primaryVariant = product.variants?.[0];
  const pricePaise = primaryVariant?.skus?.[0]?.price || '0';

  // Schema.org JSON-LD Structured Data for Search Engine Indexing
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: primaryVariant?.images?.map((img) => img.url) || [],
    offers: {
      '@type': 'Offer',
      price: (Number(BigInt(pricePaise)) / 100).toFixed(2),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
    },
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar categories={categories} />

      {/* JSON-LD Script */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main style={{ flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        <PDPClientComponent product={product} />

        {/* Similar Products Recommendation Carousel */}
        <RecommendationCarousel
          title="Similar Products You Might Like"
          subtitle="Handpicked products in the same category & brand styling"
          products={similar}
        />

        {/* Customers Also Bought Recommendation Carousel */}
        <RecommendationCarousel
          title="Customers Also Bought"
          subtitle="Co-purchased items frequently ordered together"
          products={alsoBought}
        />
      </main>

      <Footer />
    </div>
  );
}
