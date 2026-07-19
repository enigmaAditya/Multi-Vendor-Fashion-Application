import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// --- HTML Sanitization ---
// Escapes HTML special characters to prevent XSS injection.
// We store sanitized text so no raw-HTML injection is possible
// regardless of rendering context (Next.js auto-escapes text
// content, but API consumers may not).
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Verified Purchase Gate ---
  // Walks the exact join path: Order(PAID) → SubOrder → OrderItem → Sku → ProductVariant → Product
  // Returns the first matching order with its items, or null if the buyer never purchased this product.
  private async findVerifiedPurchase(buyerId: string, productId: string) {
    return this.prisma.order.findFirst({
      where: {
        buyerId,
        paymentStatus: 'PAID',
        subOrders: {
          some: {
            items: {
              some: {
                sku: {
                  variant: {
                    productId,
                  },
                },
              },
            },
          },
        },
      },
      include: {
        subOrders: {
          where: {
            items: {
              some: {
                sku: {
                  variant: {
                    productId,
                  },
                },
              },
            },
          },
          include: {
            items: {
              where: {
                sku: {
                  variant: {
                    productId,
                  },
                },
              },
              include: {
                sku: {
                  include: {
                    variant: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  // --- Create Review ---
  async createReview(
    buyerId: string,
    productId: string,
    dto: { rating: number; title?: string; comment?: string },
  ) {
    // 1. Validate product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    // 2. Validate rating range
    if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException(
        'Rating must be an integer between 1 and 5.',
      );
    }

    // 3. Verified purchase gate
    const purchase = await this.findVerifiedPurchase(buyerId, productId);
    if (!purchase) {
      throw new ForbiddenException(
        'Only verified purchasers can review this product.',
      );
    }

    // 4. Extract orderId and skuId from the verified purchase for provenance
    const matchingItem = purchase.subOrders[0]?.items[0];
    const orderId = purchase.id;
    const skuId = matchingItem?.skuId || null;

    // 5. Sanitize user inputs
    const sanitizedTitle = dto.title ? escapeHtml(dto.title) : null;
    const sanitizedComment = dto.comment ? escapeHtml(dto.comment) : null;

    // 6. Atomic create: review + product.updated outbox event
    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            productId,
            buyerId,
            rating: dto.rating,
            title: sanitizedTitle,
            comment: sanitizedComment,
            status: 'APPROVED',
            skuId,
            orderId,
          },
        });

        // Emit product.updated outbox event keyed by productId
        await tx.outboxEvent.create({
          data: {
            eventType: 'product.updated',
            payload: { productId },
          },
        });

        return created;
      });

      return review;
    } catch (err: unknown) {
      // Handle unique constraint violation: buyer already reviewed this product
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'You have already reviewed this product. Use PATCH to update your review.',
        );
      }
      throw err;
    }
  }

  // --- Update Review ---
  async updateReview(
    buyerId: string,
    reviewId: string,
    dto: { rating?: number; title?: string; comment?: string },
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Review not found.');
    }
    if (review.buyerId !== buyerId) {
      throw new ForbiddenException('You can only edit your own reviews.');
    }

    if (
      dto.rating !== undefined &&
      (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5)
    ) {
      throw new BadRequestException(
        'Rating must be an integer between 1 and 5.',
      );
    }

    const updateData: Record<string, unknown> = {};
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.title !== undefined) updateData.title = escapeHtml(dto.title);
    if (dto.comment !== undefined) updateData.comment = escapeHtml(dto.comment);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: reviewId },
        data: updateData,
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'product.updated',
          payload: { productId: review.productId },
        },
      });

      return result;
    });

    return updated;
  }

  // --- Delete Review ---
  async deleteReview(buyerId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Review not found.');
    }
    if (review.buyerId !== buyerId) {
      throw new ForbiddenException('You can only delete your own reviews.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });

      await tx.outboxEvent.create({
        data: {
          eventType: 'product.updated',
          payload: { productId: review.productId },
        },
      });
    });

    return { deleted: true };
  }

  // --- Admin: Moderate Review (approve/reject) ---
  async moderateReview(reviewId: string, status: 'APPROVED' | 'REJECTED') {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: reviewId },
        data: { status },
      });

      // Re-emit product.updated so the search rating recomputes
      // (a rejected review drops out of the APPROVED average)
      await tx.outboxEvent.create({
        data: {
          eventType: 'product.updated',
          payload: { productId: review.productId },
        },
      });

      return result;
    });

    return updated;
  }

  // --- Get Product Reviews (public, paginated, APPROVED only) ---
  async getProductReviews(
    productId: string,
    query: { limit?: number; offset?: number },
  ) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          buyer: {
            select: { id: true, phone: true },
          },
        },
      }),
      this.prisma.review.count({
        where: { productId, status: 'APPROVED' },
      }),
    ]);

    return { reviews, total };
  }

  // --- Get Product Review Stats (DB-side aggregation, APPROVED only) ---
  async getProductReviewStats(productId: string) {
    const [distribution, aggregate] = await Promise.all([
      // Rating distribution: count per star (1–5)
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId, status: 'APPROVED' },
        _count: { id: true },
      }),
      // Average rating and total count
      this.prisma.review.aggregate({
        where: { productId, status: 'APPROVED' },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    // Build 1–5 star distribution map (fill missing stars with 0)
    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const row of distribution) {
      ratingDistribution[row.rating] = row._count.id;
    }

    return {
      averageRating: aggregate._avg.rating
        ? Math.round(aggregate._avg.rating * 10) / 10
        : 0,
      totalReviews: aggregate._count.id,
      distribution: ratingDistribution,
    };
  }
}
