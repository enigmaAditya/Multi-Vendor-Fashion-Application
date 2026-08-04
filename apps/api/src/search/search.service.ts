import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Meilisearch, Index } from 'meilisearch';
import { Prisma } from '@prisma/client';
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

export interface SearchResult {
  hits: Array<{
    id: string;
    name: string;
    slug?: string;
    brandName?: string | null;
    categoryName?: string | null;
    primaryImage?: string;
    minPrice?: number;
    inStock?: boolean;
    rating?: number;
  }>;
  query: string;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
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
      await this.reindexAll();
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
      v.skus.map((s) => Number(s.price)),
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
    page?: number;
    limit?: number;
    offset?: number;
    userId?: string;
  }): Promise<SearchResult> {
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
      page,
      limit,
      offset,
      userId,
    } = params;

    const sanitize = (val: string) => val.replace(/["\\]/g, '\\$&');
    const filters: string[] = [];
    if (categoryId) {
      const categoryObj = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (categoryObj) {
        const descendants = await this.prisma.category.findMany({
          where: {
            OR: [
              { id: categoryId },
              { path: { startsWith: `${categoryObj.path}/` } },
            ],
          },
          select: { id: true },
        });
        const catFilterClause = descendants
          .map((c) => `categoryId = "${sanitize(c.id)}"`)
          .join(' OR ');
        filters.push(`(${catFilterClause})`);
      } else {
        filters.push(`categoryId = "${sanitize(categoryId)}"`);
      }
    }
    if (category) {
      filters.push(`categoryName = "${sanitize(category)}"`);
    }
    if (brandId) {
      filters.push(`brandId = "${sanitize(brandId)}"`);
    }
    if (brand) {
      filters.push(`brandName = "${sanitize(brand)}"`);
    }
    if (color) {
      filters.push(`colors = "${sanitize(color)}"`);
    }
    if (size) {
      filters.push(`sizes = "${sanitize(size)}"`);
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

    const effectiveLimit = limit ?? 20;
    const effectiveOffset =
      offset ?? (page && page > 0 ? (page - 1) * effectiveLimit : 0);

    const searchOptions = {
      filter: filters.length > 0 ? filters.join(' AND ') : undefined,
      sort: sortOption,
      facets: ['categoryName', 'brandName', 'colors', 'sizes', 'inStock'],
      limit: effectiveLimit,
      offset: effectiveOffset,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null;
    try {
      result = await this.index.search(q || '', searchOptions);
    } catch {
      result = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const hitsArr = result?.hits as unknown[];
    if (!result || !hitsArr || (hitsArr.length === 0 && !q)) {
      const dbWhere: Prisma.ProductWhereInput = { status: 'LIVE' };
      if (categoryId) {
        const categoryObj = await this.prisma.category.findUnique({
          where: { id: categoryId },
        });
        if (categoryObj) {
          const descendants = await this.prisma.category.findMany({
            where: {
              OR: [
                { id: categoryId },
                { path: { startsWith: `${categoryObj.path}/` } },
              ],
            },
            select: { id: true },
          });
          dbWhere.categoryId = { in: descendants.map((c) => c.id) };
        }
      }

      const dbProducts = await this.prisma.product.findMany({
        where: dbWhere,
        include: {
          brand: true,
          category: true,
          variants: {
            include: {
              images: true,
              skus: true,
            },
          },
        },
        take: effectiveLimit,
        skip: effectiveOffset,
      });

      const hits = dbProducts.map((p) => {
        const firstVariant = p.variants?.[0];
        const firstImage =
          firstVariant?.images?.[0]?.url ||
          'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop';
        const prices =
          p.variants?.flatMap((v) => v.skus?.map((s) => Number(s.price))) || [];
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          brandName: p.brand?.name || null,
          categoryName: p.category?.name || null,
          primaryImage: firstImage,
          minPrice,
          inStock: true,
          rating: 5,
        };
      });

      const totalCount = await this.prisma.product.count({ where: dbWhere });

      return {
        hits,
        query: q || '',
        processingTimeMs: 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
        estimatedTotalHits: totalCount,
      };
    }

    // Log search query asynchronously
    const logFilters = filters.length > 0 ? JSON.stringify(filters) : null;
    const resultObj = result as { hits?: unknown[] } | null;
    const searchHitsCount = Array.isArray(resultObj?.hits)
      ? resultObj.hits.length
      : 0;

    this.prisma.searchQueryLog
      .create({
        data: {
          query: q || '',
          filters: logFilters,
          resultsCount: searchHitsCount,
          userId: userId || null,
        },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to log search query: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return result as SearchResult;
  }
}
