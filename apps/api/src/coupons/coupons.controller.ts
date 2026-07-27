import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CouponsService, CartItemInput } from './coupons.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    roles: string[];
  };
}

interface CreateCouponDto {
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
}

interface ValidateCouponDto {
  code: string;
  cartItems: CartItemInput[];
}

interface UpdateStatusDto {
  isActive: boolean;
}

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // --- Create Coupon (Admin or Seller) ---
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SELLER')
  async create(
    @Req() req: Request & { user: { sub: string; roles: string[] } },
    @Body() dto: CreateCouponDto,
  ) {
    const isSellerOnly =
      req.user.roles.includes('SELLER') && !req.user.roles.includes('ADMIN');
    const sellerId = isSellerOnly ? req.user.sub : null;

    return this.couponsService.createCoupon(sellerId, dto);
  }

  // --- List Coupons (Admin or Seller) ---
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SELLER')
  async list(@Req() req: Request & { user: { sub: string; roles: string[] } }) {
    const isSellerOnly =
      req.user.roles.includes('SELLER') && !req.user.roles.includes('ADMIN');
    const sellerId = isSellerOnly ? req.user.sub : undefined;

    return this.couponsService.getCoupons(sellerId);
  }

  // --- Validate Coupon Preview (Authenticated Customer) ---
  @Post('validate')
  @UseGuards(JwtAuthGuard)
  async validate(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: ValidateCouponDto,
  ) {
    const result = await this.couponsService.validateAndCalculateDiscount(
      dto.code,
      req.user.sub,
      dto.cartItems,
    );

    return {
      coupon: {
        id: result.coupon.id,
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        fundingType: result.coupon.fundingType,
      },
      discountAmount: result.discountAmount.toString(),
      qualifyingSubtotal: result.qualifyingSubtotal.toString(),
    };
  }

  // --- Toggle Coupon Status (Admin or Seller) ---
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SELLER')
  async updateStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const isAdmin = req.user.roles.includes('ADMIN');
    const sellerId = isAdmin ? undefined : req.user.sub;
    return this.couponsService.updateStatus(id, dto.isActive, sellerId);
  }
}
