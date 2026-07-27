import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';

import { Prisma } from '@prisma/client';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
  ) {}

  // --- 1. List Sellers ---
  async listSellers(kycStatus?: string) {
    const whereClause: Prisma.UserWhereInput = {
      roles: { has: 'SELLER' },
    };

    if (kycStatus) {
      whereClause.linkedAccount = { status: kycStatus };
    }

    const sellers = await this.prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        phone: true,
        roles: true,
        createdAt: true,
        linkedAccount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sellers;
  }

  // --- 2. Approve/Reject Seller KYC ---
  async approveSellerKyc(
    sellerId: string,
    status: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
  ) {
    const seller = await this.prisma.user.findFirst({
      where: { id: sellerId, roles: { has: 'SELLER' } },
    });

    if (!seller) {
      throw new NotFoundException('Seller account not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedAccount = await tx.sellerLinkedAccount.upsert({
        where: { sellerId },
        create: {
          sellerId,
          gatewayAccountId: `acc_${sellerId.slice(0, 16)}`,
          status: status === 'APPROVED' ? 'ACTIVE' : 'SUSPENDED',
        },
        update: {
          status: status === 'APPROVED' ? 'ACTIVE' : 'SUSPENDED',
        },
      });

      // Emits outbox event for notification fan-out
      const eventType =
        status === 'APPROVED' ? 'seller.approved' : 'seller.rejected';
      await tx.outboxEvent.create({
        data: {
          eventType,
          payload: {
            sellerId,
            status,
            rejectionReason: rejectionReason || null,
          },
        },
      });

      return updatedAccount;
    });
  }

  // --- 3. Set Commission Rule ---
  async setCommissionRule(dto: {
    categoryId?: string;
    sellerId?: string;
    rateBasisPoints: number;
  }) {
    let rule;
    if (dto.categoryId) {
      rule = await this.prisma.commissionRule.upsert({
        where: { categoryId: dto.categoryId },
        create: {
          categoryId: dto.categoryId,
          rateBasisPoints: dto.rateBasisPoints,
        },
        update: {
          rateBasisPoints: dto.rateBasisPoints,
        },
      });
    } else if (dto.sellerId) {
      rule = await this.prisma.commissionRule.upsert({
        where: { sellerId: dto.sellerId },
        create: {
          sellerId: dto.sellerId,
          rateBasisPoints: dto.rateBasisPoints,
        },
        update: {
          rateBasisPoints: dto.rateBasisPoints,
        },
      });
    }

    if (!rule) return null;
    return {
      ...rule,
      ratePercent: rule.rateBasisPoints / 100,
    };
  }

  // --- 4. List Pending Products for Moderation ---
  async listPendingProducts(limit = 20) {
    return this.prisma.product.findMany({
      where: { status: 'PENDING_REVIEW' },
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        category: true,
        brand: true,
        seller: {
          select: { id: true, phone: true },
        },
        variants: {
          include: {
            images: true,
            skus: true,
          },
        },
      },
    });
  }

  // --- 5. Moderate Product (State Machine + Search Outbox Emission) ---
  async moderateProduct(
    productId: string,
    status: 'LIVE' | 'REJECTED' | 'SUSPENDED',
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { status },
      });

      // Emit product.updated outbox event so SearchProcessor updates or de-indexes Meilisearch
      await tx.outboxEvent.create({
        data: {
          eventType: 'product.updated',
          payload: {
            productId: updatedProduct.id,
            status: updatedProduct.status,
            name: updatedProduct.name,
            slug: updatedProduct.slug,
            categoryId: updatedProduct.categoryId,
            brandId: updatedProduct.brandId,
          },
        },
      });

      return updatedProduct;
    });
  }

  // --- 6. Moderate Review (Reuse ReviewsService) ---
  async moderateReview(reviewId: string, status: 'APPROVED' | 'REJECTED') {
    return this.reviewsService.moderateReview(reviewId, status);
  }

  // --- 7. Get Financial Summary (Ledger Aggregation) ---
  async getFinancialSummary() {
    const [gmvResult, commissionResult, payoutsResult, promoResult] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ total: bigint }>>`
          SELECT COALESCE(SUM(amount), 0)::bigint as total FROM sub_orders;
        `,
        this.prisma.$queryRaw<Array<{ total: bigint }>>`
          SELECT COALESCE(SUM(amount), 0)::bigint as total FROM commission_ledger;
        `,
        this.prisma.$queryRaw<Array<{ total: bigint }>>`
          SELECT COALESCE(SUM(amount), 0)::bigint as total FROM payouts WHERE status = 'SETTLED';
        `,
        this.prisma.$queryRaw<Array<{ total: bigint }>>`
          SELECT COALESCE(SUM(amount), 0)::bigint as total FROM promotion_ledger WHERE type = 'PLATFORM_PROMO_EXPENSE';
        `,
      ]);

    const gmv = gmvResult[0]?.total ? gmvResult[0].total.toString() : '0';
    const totalCommission = commissionResult[0]?.total
      ? commissionResult[0].total.toString()
      : '0';
    const totalPayouts = payoutsResult[0]?.total
      ? payoutsResult[0].total.toString()
      : '0';
    const platformPromoExpenses = promoResult[0]?.total
      ? promoResult[0].total.toString()
      : '0';

    return {
      gmv,
      totalCommission,
      totalPayouts,
      platformPromoExpenses,
    };
  }
}
