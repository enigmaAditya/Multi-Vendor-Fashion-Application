import { Test, TestingModule } from '@nestjs/testing';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: PrismaService;

  const mockPrisma = {
    coupon: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    couponRedemption: {
      count: jest.fn(),
    },
    sku: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('validateAndCalculateDiscount', () => {
    it('should throw NotFoundException for non-existent coupon code', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.validateAndCalculateDiscount('INVALID', 'user-1', [
          { skuId: 'sku-1', quantity: 1 },
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if coupon is inactive', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'c-1',
        code: 'INACTIVE',
        isActive: false,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 10000),
      });

      await expect(
        service.validateAndCalculateDiscount('INACTIVE', 'user-1', [
          { skuId: 'sku-1', quantity: 1 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if coupon is expired', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'c-1',
        code: 'EXPIRED',
        isActive: true,
        startsAt: new Date(Date.now() - 20000),
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(
        service.validateAndCalculateDiscount('EXPIRED', 'user-1', [
          { skuId: 'sku-1', quantity: 1 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user exceeded maxRedemptionsPerUser', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'c-1',
        code: 'LIMITED',
        isActive: true,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 10000),
        maxRedemptions: 10,
        currentRedemptions: 2,
        maxRedemptionsPerUser: 1,
      });
      mockPrisma.couponRedemption.count.mockResolvedValue(1);

      await expect(
        service.validateAndCalculateDiscount('LIMITED', 'user-1', [
          { skuId: 'sku-1', quantity: 1 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should correctly calculate a PERCENTAGE discount with maxDiscountAmount cap', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'c-1',
        code: 'SAVE20',
        discountType: 'PERCENTAGE',
        discountValue: BigInt(20), // 20%
        fundingType: 'PLATFORM',
        maxDiscountAmount: BigInt(1500), // Max ₹15 cap (1500 paise)
        minOrderAmount: BigInt(0),
        maxRedemptions: null,
        currentRedemptions: 0,
        maxRedemptionsPerUser: 5,
        isActive: true,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 10000),
        sellerId: null,
        categoryId: null,
      });
      mockPrisma.couponRedemption.count.mockResolvedValue(0);

      // Cart total: 1 item @ ₹100 = 10000 paise. 20% = ₹20 (2000 paise).
      // Should cap at maxDiscountAmount ₹15 (1500 paise).
      mockPrisma.sku.findMany.mockResolvedValue([
        {
          id: 'sku-1',
          price: BigInt(10000),
          sellerId: 'seller-1',
          variant: { product: { categoryId: 'cat-1' } },
        },
      ]);

      const result = await service.validateAndCalculateDiscount(
        'save20',
        'user-1',
        [{ skuId: 'sku-1', quantity: 1 }],
      );

      expect(result.discountAmount).toBe(BigInt(1500));
      expect(result.qualifyingSubtotal).toBe(BigInt(10000));
    });

    it('should correctly calculate a FIXED discount capped at cart subtotal', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'c-2',
        code: 'FLAT500',
        discountType: 'FIXED',
        discountValue: BigInt(50000), // ₹500
        fundingType: 'PLATFORM',
        maxDiscountAmount: null,
        minOrderAmount: BigInt(1000), // ₹10 min
        maxRedemptions: null,
        currentRedemptions: 0,
        maxRedemptionsPerUser: 5,
        isActive: true,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 10000),
        sellerId: null,
        categoryId: null,
      });
      mockPrisma.couponRedemption.count.mockResolvedValue(0);

      // Cart total: 1 item @ ₹300 = 30000 paise. Discount is ₹500 (50000 paise).
      // Should cap discount at cart subtotal ₹300 (30000 paise), never negative.
      mockPrisma.sku.findMany.mockResolvedValue([
        {
          id: 'sku-1',
          price: BigInt(30000),
          sellerId: 'seller-1',
          variant: { product: { categoryId: 'cat-1' } },
        },
      ]);

      const result = await service.validateAndCalculateDiscount(
        'FLAT500',
        'user-1',
        [{ skuId: 'sku-1', quantity: 1 }],
      );

      expect(result.discountAmount).toBe(BigInt(30000));
    });

    it('should enforce minOrderAmount threshold', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'c-3',
        code: 'MIN100',
        discountType: 'FIXED',
        discountValue: BigInt(2000),
        fundingType: 'PLATFORM',
        maxDiscountAmount: null,
        minOrderAmount: BigInt(10000), // Min ₹100 (10000 paise)
        maxRedemptions: null,
        currentRedemptions: 0,
        maxRedemptionsPerUser: 5,
        isActive: true,
        startsAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 10000),
        sellerId: null,
        categoryId: null,
      });
      mockPrisma.couponRedemption.count.mockResolvedValue(0);

      // Cart total: 1 item @ ₹50 = 5000 paise < 10000 paise
      mockPrisma.sku.findMany.mockResolvedValue([
        {
          id: 'sku-1',
          price: BigInt(5000),
          sellerId: 'seller-1',
          variant: { product: { categoryId: 'cat-1' } },
        },
      ]);

      await expect(
        service.validateAndCalculateDiscount('MIN100', 'user-1', [
          { skuId: 'sku-1', quantity: 1 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
