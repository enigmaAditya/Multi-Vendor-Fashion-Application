import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrisma: Record<string, any> = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    sellerLinkedAccount: {
      upsert: jest.fn(),
    },
    commissionRule: {
      upsert: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => unknown) => cb(mockPrisma)),
    $queryRaw: jest.fn(),
  };

  const mockReviewsService = {
    moderateReview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReviewsService, useValue: mockReviewsService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  describe('approveSellerKyc', () => {
    it('should throw NotFoundException if seller does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.approveSellerKyc('seller-1', 'APPROVED'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update SellerLinkedAccount and emit seller.approved outbox event', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'seller-1',
        roles: ['SELLER'],
      });
      mockPrisma.sellerLinkedAccount.upsert.mockResolvedValue({
        sellerId: 'seller-1',
        status: 'APPROVED',
        bankAccountVerified: true,
      });

      const result = await service.approveSellerKyc('seller-1', 'APPROVED');
      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'seller.approved',
          payload: expect.objectContaining({ sellerId: 'seller-1' }),
        }),
      });
    });
  });

  describe('setCommissionRule', () => {
    it('should upsert CommissionRule for categoryId', async () => {
      mockPrisma.commissionRule.upsert.mockResolvedValue({
        categoryId: 'cat-1',
        rateBasisPoints: 850,
      });

      const res = await service.setCommissionRule({
        categoryId: 'cat-1',
        rateBasisPoints: 850,
      });
      expect(res?.rateBasisPoints).toBe(850);
      expect(mockPrisma.commissionRule.upsert).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
        create: { categoryId: 'cat-1', rateBasisPoints: 850 },
        update: { rateBasisPoints: 850 },
      });
    });
  });

  describe('moderateProduct', () => {
    it('should update product status and emit product.updated outbox event for search re-indexing', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'PENDING_REVIEW',
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'prod-1',
        status: 'LIVE',
        name: 'Approved Product',
        slug: 'approved-product',
        categoryId: 'cat-1',
        brandId: 'brand-1',
      });

      const res = await service.moderateProduct('prod-1', 'LIVE');
      expect(res.status).toBe('LIVE');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'product.updated',
          payload: expect.objectContaining({
            productId: 'prod-1',
            status: 'LIVE',
          }),
        },
      });
    });
  });

  describe('moderateReview', () => {
    it('should delegate to ReviewsService.moderateReview', async () => {
      mockReviewsService.moderateReview.mockResolvedValue({
        id: 'review-1',
        status: 'APPROVED',
      });

      const res = await service.moderateReview('review-1', 'APPROVED');
      expect(res.status).toBe('APPROVED');
      expect(mockReviewsService.moderateReview).toHaveBeenCalledWith(
        'review-1',
        'APPROVED',
      );
    });
  });

  describe('getFinancialSummary', () => {
    it('should execute raw SQL aggregations over ledgers and return formatted totals', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ total: 1000000n }]) // GMV: 1000000
        .mockResolvedValueOnce([{ total: 50000n }]) // Commission: 50000
        .mockResolvedValueOnce([{ total: 900000n }]) // Payouts: 900000
        .mockResolvedValueOnce([{ total: 10000n }]); // Promo: 10000

      const summary = await service.getFinancialSummary();
      expect(summary.gmv).toBe('1000000');
      expect(summary.totalCommission).toBe('50000');
      expect(summary.totalPayouts).toBe('900000');
      expect(summary.platformPromoExpenses).toBe('10000');
    });
  });
});
