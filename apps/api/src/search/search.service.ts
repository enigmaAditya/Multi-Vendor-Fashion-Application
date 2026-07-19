import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Meilisearch, Index } from 'meilisearch';
import { PrismaService } from '../prisma/prisma.service';

export interface ProductSearchDocument {
  id: string;
  name: string;
  description: string | null;
  status: string;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: number;
  rating: number; // Placeholder
  salesVelocity: number; // Placeholder
  inStock: boolean;
  colors: string[];
  sizes: string[];
  minPrice: number;
  maxPrice: number;
  attributes: Array<{ name: string; value: string }>;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: Meilisearch;
  private index: Index;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const host =
      process.env.MEILI_HOST ||
      process.env.MEILISEARCH_HOST ||
      'http://localhost:7700';
    const apiKey =
      process.env.MEILI_MASTER_KEY ||
      process.env.MEILISEARCH_KEY ||
      'dev-master-key';

    try {
      this.client = new Meilisearch({ host, apiKey });
      this.index = this.client.index('products');

      // Initialize settings on bootstrap
      await this.index.updateSettings({
        searchableAttributes: [
          'name',
          'description',
          'brandName',
          'categoryName',
          'colors',
          'sizes',
          'attributes.value',
        ],
        filterableAttributes: [
          'brandId',
          'brandName',
          'categoryId',
          'categoryName',
          'colors',
          'sizes',
          'minPrice',
          'maxPrice',
          'inStock',
          'rating',
          'attributes.name',
          'attributes.value',
        ],
        sortableAttributes: [
          'minPrice',
          'maxPrice',
          'rating',
          'salesVelocity',
          'createdAt',
        ],
        rankingRules: [
          'words',
          'typo',
          'proximity',
          'attribute',
          'sort',
          'inStock:desc',
          'salesVelocity:desc', // Placeholder: inert until fed
          'rating:desc', // Placeholder: inert until fed
          'exactness',
        ],
      });
      this.logger.log('Meilisearch settings initialized successfully.');
    } catch (err: unknown) {
      // Degrade gracefully, do not crash application cold-start
      this.logger.error(
        'Failed to initialize Meilisearch settings:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // --- Admin Triggered Full Re-Index Backfill ---
  async reindexAll() {
    this.logger.log('Starting full re-indexing of all LIVE products...');
    const products = await this.prisma.product.findMany({
      where: { status: 'LIVE' },
      select: { id: true },
    });

    for (const p of products) {
      try {
        await this.upsertProductToIndex(p.id);
      } catch (err: unknown) {
        this.logger.error(
          `Failed to index product ${p.id} during backfill: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `Full re-indexing complete. Processed ${products.length} products.`,
    );
    return { processedCount: products.length };
  }

  // --- Idempotent Doc Upsert / Delete Router ---
  async upsertProductToIndex(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        brand: true,
        attributes: {
          include: {
            attributeValue: {
              include: {
                attribute: true,
              },
            },
          },
        },
        variants: {
          include: {
            skus: {
              include: {
                inventories: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      try {
        await this.index.deleteDocument(productId);
      } catch {
        // Document not found in index or delete failed, ignore
      }
      return;
    }

    // Delete non-LIVE status products from search index
    if (product.status !== 'LIVE') {
      try {
        await this.index.deleteDocument(productId);
      } catch {
        // Document not found in index or delete failed, ignore
      }
      return;
    }

    const colors = Array.from(
      new Set(
        product.variants.map((v) => v.color).filter((c) => c !== undefined),
      ),
    );
    const sizes = Array.from(
      new Set(
        product.variants
          .flatMap((v) => v.skus.map((s) => s.size))
          .filter((s) => s !== undefined),
      ),
    );

    const skuPrices = product.variants.flatMap((v) =>
      v.skus.map((s) => Number(s.price) / 100),
    );
    const minPrice = skuPrices.length > 0 ? Math.min(...skuPrices) : 0;
    const maxPrice = skuPrices.length > 0 ? Math.max(...skuPrices) : 0;

    let inStock = false;
    for (const variant of product.variants) {
      for (const sku of variant.skus) {
        const availableStock = sku.inventories.reduce(
          (acc, inv) => acc + (inv.onHand - inv.reserved),
          0,
        );
        if (availableStock > 0) {
          inStock = true;
          break;
        }
      }
      if (inStock) break;
    }

    const attributes = product.attributes.map((attrMap) => ({
      name: attrMap.attributeValue.attribute.name,
      value: attrMap.attributeValue.value,
    }));

    // Compute average rating from APPROVED reviews only
    const reviewAgg = await this.prisma.review.aggregate({
      where: { productId, status: 'APPROVED' },
      _avg: { rating: true },
    });
    const rating = reviewAgg._avg.rating
      ? Math.round(reviewAgg._avg.rating * 10) / 10
      : 0;

    const doc: ProductSearchDocument = {
      id: product.id,
      name: product.name,
      description: product.description,
      status: product.status,
      brandId: product.brandId,
      brandName: product.brand?.name || null,
      categoryId: product.categoryId,
      categoryName: product.category?.name || null,
      createdAt: Math.floor(product.createdAt.getTime() / 1000),
      rating,
      salesVelocity: 0,
      inStock,
      colors,
      sizes,
      minPrice,
      maxPrice,
      attributes,
    };

    await this.index.addDocuments([doc]);
  }

  // --- Deletion Helper ---
  async deleteProductFromIndex(productId: string) {
    try {
      await this.index.deleteDocument(productId);
    } catch {
      // Document not found in index or delete failed, ignore
    }
  }

  // --- Public Search/Filter Endpoint Logic ---
  async search(params: {
    q?: string;
    categoryId?: string;
    category?: string;
    brandId?: string;
    brand?: string;
    color?: string;
    size?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    sort?: string;
    limit?: number;
    offset?: number;
    userId?: string;
  }) {
    const {
      q,
      categoryId,
      category,
      brandId,
      brand,
      color,
      size,
      minPrice,
      maxPrice,
      inStock,
      sort,
      limit,
      offset,
      userId,
    } = params;

    const filters: string[] = [];
    if (categoryId) {
      filters.push(`categoryId = "${categoryId}"`);
    }
    if (category) {
      filters.push(`categoryName = "${category}"`);
    }
    if (brandId) {
      filters.push(`brandId = "${brandId}"`);
    }
    if (brand) {
      filters.push(`brandName = "${brand}"`);
    }
    if (color) {
      filters.push(`colors = "${color}"`);
    }
    if (size) {
      filters.push(`sizes = "${size}"`);
    }
    if (minPrice !== undefined && minPrice !== null) {
      filters.push(`minPrice >= ${minPrice}`);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
      filters.push(`maxPrice <= ${maxPrice}`);
    }
    if (inStock !== undefined && inStock !== null) {
      filters.push(`inStock = ${inStock}`);
    }

    let sortOption: string[] | undefined = undefined;
    if (sort === 'price_asc' || sort === 'PRICE_ASC') {
      sortOption = ['minPrice:asc'];
    } else if (sort === 'price_desc' || sort === 'PRICE_DESC') {
      sortOption = ['maxPrice:desc'];
    } else if (sort === 'rating_desc' || sort === 'RATING_DESC') {
      sortOption = ['rating:desc'];
    } else if (sort === 'newest' || sort === 'NEWEST') {
      sortOption = ['createdAt:desc'];
    }

    const searchOptions = {
      filter: filters.length > 0 ? filters.join(' AND ') : undefined,
      sort: sortOption,
      facets: ['categoryName', 'brandName', 'colors', 'sizes', 'inStock'],
      limit: limit ?? 20,
      offset: offset ?? 0,
    };

    const result = await this.index.search(q || '', searchOptions);

    // Asynchronous query logging (fire-and-forget: does not block event loop)
    const logFilters = filters.length > 0 ? JSON.stringify(filters) : null;
    const count = result.estimatedTotalHits ?? result.hits.length;

    this.prisma.searchQueryLog
      .create({
        data: {
          query: q || '',
          filters: logFilters,
          resultsCount: count,
          userId: userId || null,
        },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to log search query: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return result;
  }
}
