import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: PrismaService;

  const mockPrisma = {
    product: {
      findUnique: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
    },
    review: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('createReview', () => {
    it('should throw NotFoundException if product does not exist', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview('buyer-1', 'prod-1', {
          rating: 5,
          title: 'Great!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid rating', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });

      await expect(
        service.createReview('buyer-1', 'prod-1', { rating: 6 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createReview('buyer-1', 'prod-1', { rating: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createReview('buyer-1', 'prod-1', { rating: 3.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if buyer has no verified purchase', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview('buyer-1', 'prod-1', { rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create a review for a verified purchaser', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        subOrders: [
          {
            items: [
              { skuId: 'sku-1', sku: { variant: { productId: 'prod-1' } } },
            ],
          },
        ],
      });

      const expectedReview = {
        id: 'review-1',
        productId: 'prod-1',
        buyerId: 'buyer-1',
        rating: 5,
        title: 'Great product!',
        comment: 'Really enjoyed it',
        status: 'APPROVED',
        orderId: 'order-1',
        skuId: 'sku-1',
      };

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return fn(mockPrisma);
        },
      );
      mockPrisma.review.create.mockResolvedValue(expectedReview);
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.createReview('buyer-1', 'prod-1', {
        rating: 5,
        title: 'Great product!',
        comment: 'Really enjoyed it',
      });

      expect(result).toEqual(expectedReview);
      expect(mockPrisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          buyerId: 'buyer-1',
          rating: 5,
          status: 'APPROVED',
          orderId: 'order-1',
          skuId: 'sku-1',
        }),
      });
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'product.updated',
          payload: { productId: 'prod-1' },
        },
      });
    });

    it('should sanitize HTML in title and comment', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        subOrders: [
          {
            items: [
              { skuId: 'sku-1', sku: { variant: { productId: 'prod-1' } } },
            ],
          },
        ],
      });
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return fn(mockPrisma);
        },
      );
      mockPrisma.review.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.createReview('buyer-1', 'prod-1', {
        rating: 4,
        title: '<script>alert("xss")</script>',
        comment: 'Rating is 5 < 6 & "great"',
      });

      expect(mockPrisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
          comment: 'Rating is 5 &lt; 6 &amp; &quot;great&quot;',
        }),
      });
    });

    it('should throw ConflictException on duplicate review', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        subOrders: [
          {
            items: [
              { skuId: 'sku-1', sku: { variant: { productId: 'prod-1' } } },
            ],
          },
        ],
      });

      const { PrismaClientKnownRequestError } =
        jest.requireActual('@prisma/client').Prisma;
      const uniqueError = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.$transaction.mockRejectedValue(uniqueError);

      await expect(
        service.createReview('buyer-1', 'prod-1', { rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getProductReviewStats', () => {
    it('should return DB-aggregated stats with APPROVED filter', async () => {
      mockPrisma.review.groupBy.mockResolvedValue([
        { rating: 5, _count: { id: 10 } },
        { rating: 4, _count: { id: 5 } },
        { rating: 1, _count: { id: 2 } },
      ]);
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.2 },
        _count: { id: 17 },
      });

      const stats = await service.getProductReviewStats('prod-1');

      expect(stats).toEqual({
        averageRating: 4.2,
        totalReviews: 17,
        distribution: { 1: 2, 2: 0, 3: 0, 4: 5, 5: 10 },
      });

      // Verify both queries filter by APPROVED
      expect(mockPrisma.review.groupBy).toHaveBeenCalledWith({
        by: ['rating'],
        where: { productId: 'prod-1', status: 'APPROVED' },
        _count: { id: true },
      });
      expect(mockPrisma.review.aggregate).toHaveBeenCalledWith({
        where: { productId: 'prod-1', status: 'APPROVED' },
        _avg: { rating: true },
        _count: { id: true },
      });
    });
  });

  describe('moderateReview', () => {
    it('should update status and emit product.updated outbox event', async () => {
      mockPrisma.review.findUnique.mockResolvedValue({
        id: 'review-1',
        productId: 'prod-1',
      });
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return fn(mockPrisma);
        },
      );
      mockPrisma.review.update.mockResolvedValue({
        id: 'review-1',
        status: 'REJECTED',
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.moderateReview('review-1', 'REJECTED');

      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'product.updated',
          payload: { productId: 'prod-1' },
        },
      });
    });
  });
});
