import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- 1. Track Product View (Fire and Forget) ---
  async trackProductView(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true },
    });

    if (!product || product.status !== 'LIVE') {
      throw new NotFoundException('Product not found or unavailable.');
    }

    await this.prisma.userProductView.upsert({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      create: {
        userId,
        productId,
        viewedAt: new Date(),
      },
      update: {
        viewedAt: new Date(),
      },
    });

    return { success: true };
  }

  // --- 2. Recently Viewed Products ---
  async getRecentlyViewed(userId: string, limit = 10) {
    const views = await this.prisma.userProductView.findMany({
      where: {
        userId,
        product: {
          status: 'LIVE',
        },
      },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      include: {
        product: {
          include: {
            variants: {
              include: {
                images: true,
                skus: {
                  include: {
                    inventories: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return views.map((v) => this.formatProductCard(v.product));
  }

  // --- 3. Trending Products (SQL Score Aggregation) ---
  async getTrendingProducts(limit = 10, days = 7, categoryId?: string) {
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const categoryFilter = categoryId
      ? Prisma.sql`AND p."categoryId" = ${categoryId}`
      : Prisma.empty;

    const trendingRaw = await this.prisma.$queryRaw<
      Array<{
        id: string;
        sales_count: number;
        reviews_count: number;
        views_count: number;
        score: number;
      }>
    >`
      SELECT 
        p.id,
        COALESCE(s.sales_cnt, 0)::int as sales_count,
        COALESCE(r.reviews_cnt, 0)::int as reviews_count,
        COALESCE(v.views_cnt, 0)::int as views_count,
        (COALESCE(s.sales_cnt, 0) * 5 + COALESCE(r.reviews_cnt, 0) * 3 + COALESCE(v.views_cnt, 0) * 1)::int as score
      FROM products p
      LEFT JOIN (
        SELECT v."productId" as product_id, COUNT(oi.id) as sales_cnt
        FROM order_items oi
        JOIN skus s ON oi."skuId" = s.id
        JOIN product_variants v ON s."variantId" = v.id
        JOIN sub_orders so ON oi."subOrderId" = so.id
        WHERE so."createdAt" >= ${windowStart}
        GROUP BY v."productId"
      ) s ON p.id = s.product_id
      LEFT JOIN (
        SELECT "productId" as product_id, COUNT(id) as reviews_cnt
        FROM reviews
        WHERE status = 'APPROVED' AND "createdAt" >= ${windowStart}
        GROUP BY "productId"
      ) r ON p.id = r.product_id
      LEFT JOIN (
        SELECT product_id, COUNT(id) as views_cnt
        FROM user_product_views
        WHERE viewed_at >= ${windowStart}
        GROUP BY product_id
      ) v ON p.id = v.product_id
      WHERE p.status = 'LIVE'
      ${categoryFilter}
      ORDER BY score DESC, p."createdAt" DESC
      LIMIT ${limit};
    `;

    const productIds = trendingRaw.map((row) => row.id);
    if (productIds.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        variants: {
          include: {
            images: true,
            skus: {
              include: {
                inventories: true,
              },
            },
          },
        },
      },
    });

    // Re-order by exact score ranking order
    const productMap = new Map(products.map((p) => [p.id, p]));
    return productIds
      .map((id) => productMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .map((p) => this.formatProductCard(p));
  }

  // --- 4. Similar Products (Soft Sorting by Brand) ---
  async getSimilarProducts(productId: string, limit = 10) {
    const targetProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true, brandId: true },
    });

    if (!targetProduct) {
      throw new NotFoundException('Product not found.');
    }

    const similarProducts = await this.prisma.product.findMany({
      where: {
        id: { not: productId },
        categoryId: targetProduct.categoryId,
        status: 'LIVE',
      },
      take: limit * 2, // Fetch double for soft-sorting
      include: {
        variants: {
          include: {
            images: true,
            skus: {
              include: {
                inventories: true,
              },
            },
          },
        },
      },
    });

    // Soft-sort: Same brand first, then creation date desc
    const sorted = [...similarProducts].sort((a, b) => {
      const aSameBrand = a.brandId === targetProduct.brandId ? 1 : 0;
      const bSameBrand = b.brandId === targetProduct.brandId ? 1 : 0;

      if (aSameBrand !== bSameBrand) {
        return bSameBrand - aSameBrand; // Match brand first
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return sorted.slice(0, limit).map((p) => this.formatProductCard(p));
  }

  // --- 5. Customers Also Bought (Co-Purchase Aggregation with Fallback) ---
  async getCustomersAlsoBought(productId: string, limit = 10) {
    const refProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true },
    });

    if (!refProduct) {
      throw new NotFoundException('Product not found.');
    }

    // 1. Find recent order IDs containing this productId (bounded to 500 order items)
    const recentOrderItems = await this.prisma.orderItem.findMany({
      where: {
        sku: {
          variant: {
            productId,
          },
        },
      },
      select: {
        subOrder: {
          select: { orderId: true },
        },
      },
      take: 500,
    });

    const orderIds = Array.from(
      new Set(recentOrderItems.map((item) => item.subOrder.orderId)),
    );

    let coPurchasedProductIds: string[] = [];

    if (orderIds.length > 0) {
      // 2. Query sibling OrderItems in those orders, excluding current productId
      const siblingItems = await this.prisma.orderItem.findMany({
        where: {
          subOrder: {
            orderId: { in: orderIds },
          },
          sku: {
            variant: {
              productId: { not: productId },
              product: {
                status: 'LIVE',
              },
            },
          },
        },
        select: {
          sku: {
            select: {
              variant: {
                select: { productId: true },
              },
            },
          },
        },
        take: 200,
      });

      // Count co-purchased product frequency
      const freqMap = new Map<string, number>();
      for (const item of siblingItems) {
        const pId = item.sku.variant.productId;
        freqMap.set(pId, (freqMap.get(pId) || 0) + 1);
      }

      coPurchasedProductIds = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([pId]) => pId);
    }

    // 3. If co-purchased results are below limit, fallback to category top-sellers
    let finalProductIds = [...coPurchasedProductIds];
    if (finalProductIds.length < limit && refProduct.categoryId) {
      const fallbackProducts = await this.getTrendingProducts(
        limit,
        30,
        refProduct.categoryId,
      );

      for (const fp of fallbackProducts) {
        if (fp.id !== productId && !finalProductIds.includes(fp.id)) {
          finalProductIds.push(fp.id);
        }
        if (finalProductIds.length >= limit) break;
      }
    }

    finalProductIds = finalProductIds.slice(0, limit);
    if (finalProductIds.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: finalProductIds } },
      include: {
        variants: {
          include: {
            images: true,
            skus: {
              include: {
                inventories: true,
              },
            },
          },
        },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    return finalProductIds
      .map((id) => productMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .map((p) => this.formatProductCard(p));
  }

  // --- Helper: Format Uniform Product Card ---
  private formatProductCard(product: FormattableProduct) {
    let primaryImageUrl: string | null = null;
    let minPrice = 0;
    let totalStock = 0;

    if (product.variants && product.variants.length > 0) {
      const firstVariant = product.variants[0];
      if (firstVariant.images && firstVariant.images.length > 0) {
        primaryImageUrl = firstVariant.images[0].url;
      }

      for (const variant of product.variants) {
        if (variant.skus) {
          for (const sku of variant.skus) {
            const skuPrice = Number(sku.price);
            if (minPrice === 0 || skuPrice < minPrice) {
              minPrice = skuPrice;
            }
            if (sku.inventories && Array.isArray(sku.inventories)) {
              for (const inv of sku.inventories) {
                const onHand = inv.onHand || 0;
                const reserved = inv.reserved || 0;
                totalStock += Math.max(0, onHand - reserved);
              }
            }
          }
        }
      }
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      brandId: product.brandId,
      lowestPrice: minPrice.toString(),
      imageUrl: primaryImageUrl,
      inStock: totalStock > 0,
      totalStock,
      status: product.status,
    };
  }
}

interface FormattableProduct {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  status: string;
  variants?: Array<{
    images?: Array<{ url: string }>;
    skus?: Array<{
      price: bigint | number | string;
      inventories?: Array<{
        onHand?: number | null;
        reserved?: number | null;
      }>;
    }>;
  }>;
}
