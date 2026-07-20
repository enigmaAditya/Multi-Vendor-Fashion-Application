import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  const mockPrisma = {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    userProductView: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
    jest.clearAllMocks();
  });

  describe('trackProductView', () => {
    it('should throw NotFoundException if product does not exist or is not LIVE', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.trackProductView('user-1', 'prod-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should upsert user view record if product is LIVE and active', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'LIVE',
      });
      mockPrisma.userProductView.upsert.mockResolvedValue({
        id: 'view-1',
        userId: 'user-1',
        productId: 'prod-1',
      });

      const res = await service.trackProductView('user-1', 'prod-1');
      expect(res.success).toBe(true);
      expect(mockPrisma.userProductView.upsert).toHaveBeenCalledWith({
        where: {
          userId_productId: { userId: 'user-1', productId: 'prod-1' },
        },
        create: expect.objectContaining({
          userId: 'user-1',
          productId: 'prod-1',
        }),
        update: expect.objectContaining({}),
      });
    });
  });

  describe('getRecentlyViewed', () => {
    it('should return mapped product cards for recently viewed products', async () => {
      mockPrisma.userProductView.findMany.mockResolvedValue([
        {
          viewedAt: new Date(),
          product: {
            id: 'prod-1',
            name: 'Running Shoes',
            slug: 'running-shoes',
            description: 'Top quality',
            categoryId: 'cat-1',
            brandId: 'brand-1',
            status: 'LIVE',
            variants: [],
          },
        },
      ]);

      const result = await service.getRecentlyViewed('user-1', 5);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Running Shoes');
      expect(result[0].inStock).toBe(false);
    });
  });

  describe('getTrendingProducts', () => {
    it('should execute raw SQL score aggregation and return ranked products', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'prod-1', score: 25 },
        { id: 'prod-2', score: 10 },
      ]);

      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Trending Shirt',
          slug: 'trending-shirt',
          status: 'LIVE',
          variants: [],
        },
        {
          id: 'prod-2',
          name: 'Trending Jeans',
          slug: 'trending-jeans',
          status: 'LIVE',
          variants: [],
        },
      ]);

      const result = await service.getTrendingProducts(10, 7);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prod-1');
      expect(result[1].id).toBe('prod-2');
    });
  });

  describe('getSimilarProducts', () => {
    it('should soft-sort similar products by matching brand first', async () => {
      const date1 = new Date();
      const date2 = new Date(Date.now() + 1000);

      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-ref',
        categoryId: 'cat-shoes',
        brandId: 'brand-nike',
      });

      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-other-brand',
          name: 'Adidas Shoes',
          categoryId: 'cat-shoes',
          brandId: 'brand-adidas',
          createdAt: date2,
          status: 'LIVE',
          variants: [],
        },
        {
          id: 'prod-same-brand',
          name: 'Nike Shoes 2',
          categoryId: 'cat-shoes',
          brandId: 'brand-nike',
          createdAt: date1,
          status: 'LIVE',
          variants: [],
        },
      ]);

      const result = await service.getSimilarProducts('prod-ref', 10);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prod-same-brand'); // Nike first because soft-sort prioritizes matching brandId
    });
  });

  describe('getCustomersAlsoBought', () => {
    it('should traverse OrderItem -> Sku -> Variant -> Product and return co-purchased items', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        categoryId: 'cat-1',
      });

      // 1. OrderItem for prod-1 returns subOrder.orderId = 'order-100'
      mockPrisma.orderItem.findMany.mockImplementation((args: any) => {
        if (args.where?.sku?.variant?.productId === 'prod-1') {
          return Promise.resolve([{ subOrder: { orderId: 'order-100' } }]);
        }
        // Sibling query
        return Promise.resolve([
          { sku: { variant: { productId: 'prod-sibling-1' } } },
          { sku: { variant: { productId: 'prod-sibling-1' } } },
        ]);
      });

      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-sibling-1',
          name: 'Matched Belt',
          status: 'LIVE',
          variants: [],
        },
      ]);

      const result = await service.getCustomersAlsoBought('prod-1', 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod-sibling-1');
    });
  });
});
