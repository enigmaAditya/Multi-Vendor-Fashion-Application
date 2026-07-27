import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CartItemInput {
  skuId: string;
  quantity: number;
}

export interface ValidatedCouponResult {
  coupon: {
    id: string;
    code: string;
    discountType: string;
    discountValue: bigint;
    fundingType: string;
    maxDiscountAmount: bigint | null;
    minOrderAmount: bigint;
    sellerId: string | null;
    categoryId: string | null;
  };
  discountAmount: bigint;
  qualifyingSubtotal: bigint;
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Validate Coupon & Calculate Discount (Server-Side) ---
  async validateAndCalculateDiscount(
    code: string,
    userId: string,
    cartItems: CartItemInput[],
  ): Promise<ValidatedCouponResult> {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('Coupon code is required.');
    }

    const normalizedCode = code.trim().toUpperCase();
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (!coupon) {
      throw new NotFoundException('Invalid coupon code.');
    }

    const now = new Date();
    if (!coupon.isActive) {
      throw new BadRequestException('This coupon is currently inactive.');
    }
    if (coupon.startsAt > now) {
      throw new BadRequestException('This coupon is not active yet.');
    }
    if (coupon.expiresAt < now) {
      throw new BadRequestException('This coupon has expired.');
    }

    // Check global max redemptions
    if (
      coupon.maxRedemptions !== null &&
      coupon.currentRedemptions >= coupon.maxRedemptions
    ) {
      throw new BadRequestException('Coupon redemption limit reached.');
    }

    // Check per-user redemption limit
    const userRedemptions = await this.prisma.couponRedemption.count({
      where: {
        couponId: coupon.id,
        userId,
        status: { in: ['RESERVED', 'CONFIRMED'] },
      },
    });
    if (userRedemptions >= coupon.maxRedemptionsPerUser) {
      throw new BadRequestException(
        'You have reached the maximum allowed redemptions for this coupon.',
      );
    }

    // Fetch SKUs with variants and products to check scoping and prices
    const skuIds = cartItems.map((item) => item.skuId);
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds } },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });

    if (skus.length !== skuIds.length) {
      throw new BadRequestException('One or more SKUs in cart do not exist.');
    }

    // Filter items qualifying for the coupon based on scope
    let qualifyingCartItems = cartItems;
    if (coupon.sellerId) {
      // Seller-funded coupon: applies only to items from that seller
      qualifyingCartItems = cartItems.filter((item) => {
        const sku = skus.find((s) => s.id === item.skuId);
        return sku && sku.sellerId === coupon.sellerId;
      });
    } else if (coupon.categoryId) {
      // Category-scoped coupon: applies to items in that category
      qualifyingCartItems = cartItems.filter((item) => {
        const sku = skus.find((s) => s.id === item.skuId);
        return (
          sku &&
          sku.variant.product &&
          sku.variant.product.categoryId === coupon.categoryId
        );
      });
    }

    if (qualifyingCartItems.length === 0) {
      throw new BadRequestException(
        'Coupon is not applicable to any items in your cart.',
      );
    }

    // Calculate qualifying subtotal and total cart subtotal
    let qualifyingSubtotal = BigInt(0);
    for (const item of qualifyingCartItems) {
      const sku = skus.find((s) => s.id === item.skuId)!;
      qualifyingSubtotal += sku.price * BigInt(item.quantity);
    }

    let totalCartSubtotal = BigInt(0);
    for (const item of cartItems) {
      const sku = skus.find((s) => s.id === item.skuId)!;
      totalCartSubtotal += sku.price * BigInt(item.quantity);
    }

    if (qualifyingSubtotal < coupon.minOrderAmount) {
      const minAmountInRupees = (Number(coupon.minOrderAmount) / 100).toFixed(
        2,
      );
      throw new BadRequestException(
        `Minimum qualifying cart value of ₹${minAmountInRupees} required for this coupon.`,
      );
    }

    // Calculate raw discount
    let discountAmount = BigInt(0);
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount =
        (qualifyingSubtotal * coupon.discountValue) / BigInt(100);
      if (
        coupon.maxDiscountAmount !== null &&
        discountAmount > coupon.maxDiscountAmount
      ) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else if (coupon.discountType === 'FIXED') {
      discountAmount = coupon.discountValue;
    }

    // Cap discount at qualifying subtotal and total cart subtotal (never produce negative total)
    if (discountAmount > qualifyingSubtotal) {
      discountAmount = qualifyingSubtotal;
    }
    if (discountAmount > totalCartSubtotal) {
      discountAmount = totalCartSubtotal;
    }

    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        fundingType: coupon.fundingType,
        maxDiscountAmount: coupon.maxDiscountAmount,
        minOrderAmount: coupon.minOrderAmount,
        sellerId: coupon.sellerId,
        categoryId: coupon.categoryId,
      },
      discountAmount,
      qualifyingSubtotal,
    };
  }

  // --- Create Coupon (Admin or Seller) ---
  async createCoupon(
    creatorSellerId: string | null,
    dto: {
      code: string;
      description?: string;
      discountType: 'PERCENTAGE' | 'FIXED';
      discountValue: number | string;
      fundingType?: 'PLATFORM' | 'SELLER';
      maxDiscountAmount?: number | string;
      minOrderAmount?: number | string;
      maxRedemptions?: number;
      maxRedemptionsPerUser?: number;
      categoryId?: string;
      startsAt?: string;
      expiresAt: string;
    },
  ) {
    if (!dto.code || typeof dto.code !== 'string') {
      throw new BadRequestException('Coupon code is required.');
    }

    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({
      where: { code },
    });
    if (existing) {
      throw new BadRequestException(
        `Coupon with code "${code}" already exists.`,
      );
    }

    const discountValue = BigInt(dto.discountValue);
    if (discountValue <= BigInt(0)) {
      throw new BadRequestException('Discount value must be greater than 0.');
    }
    if (dto.discountType === 'PERCENTAGE' && discountValue > BigInt(100)) {
      throw new BadRequestException(
        'Percentage discount value cannot exceed 100.',
      );
    }

    const fundingType = creatorSellerId
      ? 'SELLER'
      : dto.fundingType || 'PLATFORM';

    const sellerId =
      creatorSellerId || (dto as { sellerId?: string }).sellerId || null;

    if (fundingType === 'SELLER' && !sellerId) {
      throw new BadRequestException(
        'Seller-funded coupons must specify a valid sellerId.',
      );
    }

    const created = await this.prisma.coupon.create({
      data: {
        code,
        description: dto.description || null,
        discountType: dto.discountType,
        discountValue,
        fundingType,
        maxDiscountAmount: dto.maxDiscountAmount
          ? BigInt(dto.maxDiscountAmount)
          : null,
        minOrderAmount: dto.minOrderAmount
          ? BigInt(dto.minOrderAmount)
          : BigInt(0),
        maxRedemptions: dto.maxRedemptions ?? null,
        maxRedemptionsPerUser: dto.maxRedemptionsPerUser ?? 1,
        sellerId,
        categoryId: dto.categoryId || null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        expiresAt: new Date(dto.expiresAt),
        isActive: true,
      },
    });

    return created;
  }

  // --- List Coupons ---
  async getCoupons(sellerId?: string) {
    const where = sellerId ? { sellerId } : {};
    return this.prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Update Coupon Status ---
  async updateStatus(id: string, isActive: boolean, sellerId?: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found.');
    }
    if (sellerId && coupon.sellerId !== sellerId) {
      throw new ForbiddenException(
        'You do not have permission to update this coupon.',
      );
    }
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive },
    });
  }
}
