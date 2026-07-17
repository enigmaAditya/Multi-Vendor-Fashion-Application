import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { PRODUCT_STATUS } from '@marketplace/constants';

describe('CatalogService', () => {
  let service: CatalogService;

  const mockPrisma: any = {
    category: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    brand: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    productAttributeValueMap: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    productVariant: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    productImage: {
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    sku: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    media: {
      findMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
    $queryRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    jest.clearAllMocks();
  });

  describe('Category path calculations', () => {
    it('should create root category with path equal to its ID', async () => {
      const parentId = null;
      mockPrisma.category.create.mockResolvedValue({
        id: 'cat-1',
        name: 'Apparel',
        slug: 'apparel',
        parentId,
        path: 'cat-1',
      });

      const category = await service.createCategory({
        name: 'Apparel',
        slug: 'apparel',
        parentId,
      });

      expect(category.path).toBeTruthy();
      expect(mockPrisma.category.create).toHaveBeenCalled();
    });

    it('should prepend parent path to child category path', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        id: 'parent-id',
        path: 'parent-id',
      });
      mockPrisma.category.create.mockImplementation((args: any) =>
        Promise.resolve({
          ...args.data,
          id: args.data.id || 'child-id',
        }),
      );

      const category = await service.createCategory({
        name: 'Shirts',
        slug: 'shirts',
        parentId: 'parent-id',
      });

      expect(category.path).toContain('parent-id/');
    });
  });

  describe('Category moves & recursive updates', () => {
    it('should fail if trying to make category its own parent', async () => {
      mockPrisma.category.findUniqueOrThrow.mockResolvedValue({
        id: 'cat-1',
        path: 'cat-1',
        parentId: null,
      });

      await expect(
        service.updateCategory('cat-1', { parentId: 'cat-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail if parent is a descendant (cyclic prevention)', async () => {
      mockPrisma.category.findUniqueOrThrow
        .mockResolvedValueOnce({ id: 'cat-1', path: 'cat-1', parentId: null }) // target
        .mockResolvedValueOnce({
          id: 'desc-1',
          path: 'cat-1/desc-1',
          parentId: 'cat-1',
        }); // parent

      await expect(
        service.updateCategory('cat-1', { parentId: 'desc-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update descendant paths when category moves', async () => {
      mockPrisma.category.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 'cat-2',
          path: 'cat-1/cat-2',
          parentId: 'cat-1',
        }) // target
        .mockResolvedValueOnce({ id: 'cat-3', path: 'cat-3', parentId: null }); // new parent

      mockPrisma.category.update.mockImplementation((args: any) =>
        Promise.resolve(args.data),
      );
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-child', path: 'cat-1/cat-2/cat-child', parentId: 'cat-2' },
      ]);

      await service.updateCategory('cat-2', { parentId: 'cat-3' });

      // Verification of path rewrite
      expect(mockPrisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-child' },
          data: { path: 'cat-3/cat-2/cat-child' },
        }),
      );
    });
  });

  describe('Product mutations & validations', () => {
    const sellerId = 'seller-1';

    it('should fail creation if categoryId provided does not exist', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createProduct(sellerId, {
          name: 'Classic Tee',
          categoryId: 'non-existent',
          brandId: null,
          attributes: [],
          variants: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create product, variants, and skus atomically', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.product.create.mockResolvedValue({
        id: 'prod-1',
        name: 'Tee',
      });
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Tee',
      });
      mockPrisma.productVariant.create.mockResolvedValue({ id: 'var-1' });

      const result = await service.createProduct(sellerId, {
        name: 'Tee',
        categoryId: 'cat-1',
        brandId: null,
        attributes: [],
        variants: [
          {
            color: 'Red',
            images: [{ url: 'https://img.com/1.png', isPrimary: true }],
            skus: [
              { skuCode: 'TSHIRT-RED-S', size: 'S', price: 9900, mrp: 12900 },
            ],
          },
        ],
      });

      expect(result).toBeDefined();
      expect(mockPrisma.sku.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            skuCode: 'TSHIRT-RED-S',
            sellerId,
          }),
        }),
      );
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'product.created',
          }),
        }),
      );
    });

    it('should enforce seller ownership on update', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        sellerId: 'different-seller',
      });

      await expect(
        service.updateProduct('prod-1', sellerId, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should preserve variant and SKU UUIDs on metadata updates', async () => {
      const mockExistingProduct = {
        id: 'prod-1',
        sellerId,
        variants: [
          {
            id: 'var-1',
            color: 'Blue',
            images: [
              {
                id: 'img-1',
                url: 'https://img.com/b.png',
                isPrimary: true,
                mediaId: null,
              },
            ],
            skus: [
              {
                id: 'sku-1',
                skuCode: 'SKU-BLUE-M',
                size: 'M',
                price: BigInt(1500),
                mrp: BigInt(2000),
                sellerId,
              },
            ],
          },
        ],
      };

      mockPrisma.product.findUnique.mockResolvedValueOnce(mockExistingProduct);
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockExistingProduct);

      const updateDto = {
        name: 'Updated Name',
        variants: [
          {
            id: 'var-1',
            color: 'Blue',
            images: [
              { id: 'img-1', url: 'https://img.com/b.png', isPrimary: true },
            ],
            skus: [
              { skuCode: 'SKU-BLUE-M', size: 'M', price: 1600, mrp: 2200 },
            ],
          },
        ],
      };

      await service.updateProduct('prod-1', sellerId, updateDto);

      expect(mockPrisma.productVariant.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.productImage.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.sku.deleteMany).not.toHaveBeenCalled();

      expect(mockPrisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'var-1' },
          data: { color: 'Blue' },
        }),
      );
      expect(mockPrisma.sku.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sku-1' },
          data: expect.objectContaining({
            price: BigInt(1600),
            mrp: BigInt(2200),
          }),
        }),
      );
    });

    it('should preserve SKU IDs and prevent churn on variant color rename', async () => {
      const mockExistingProduct = {
        id: 'prod-1',
        sellerId,
        variants: [
          {
            id: 'var-1',
            color: 'Navy',
            images: [
              {
                id: 'img-1',
                url: 'https://img.com/n.png',
                isPrimary: true,
                mediaId: null,
              },
            ],
            skus: [
              {
                id: 'sku-1',
                skuCode: 'SKU-NAVY-M',
                size: 'M',
                price: BigInt(1000),
                mrp: BigInt(1500),
                sellerId,
              },
            ],
          },
        ],
      };

      mockPrisma.product.findUnique.mockResolvedValueOnce(mockExistingProduct);
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockExistingProduct);

      const updateDto = {
        variants: [
          {
            id: 'var-1',
            color: 'Dark Blue',
            images: [
              { id: 'img-1', url: 'https://img.com/n.png', isPrimary: true },
            ],
            skus: [
              { skuCode: 'SKU-NAVY-M', size: 'M', price: 1000, mrp: 1500 },
            ],
          },
        ],
      };

      await service.updateProduct('prod-1', sellerId, updateDto);

      expect(mockPrisma.productVariant.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'var-1' },
          data: { color: 'Dark Blue' },
        }),
      );
      expect(mockPrisma.sku.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sku-1' },
        }),
      );
    });

    it('should block linking unprocessed or different seller mediaId', async () => {
      mockPrisma.media.findMany.mockResolvedValue([
        {
          id: 'media-bad',
          status: 'PENDING_UPLOAD',
          userId: 'seller-other',
        },
      ]);

      const updateDto = {
        variants: [
          {
            color: 'Red',
            images: [
              {
                url: 'https://img.com/r.png',
                isPrimary: true,
                mediaId: 'media-bad',
              },
            ],
            skus: [{ skuCode: 'SKU-RED-S', size: 'S', price: 1000, mrp: 1000 }],
          },
        ],
      };

      await expect(
        service.updateProduct('prod-1', sellerId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject with BadRequestException on variant or image ID mismatches', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        sellerId,
        variants: [
          {
            id: 'var-real',
            color: 'Black',
            images: [{ id: 'img-real', url: '...' }],
          },
        ],
      });

      const updateDto = {
        variants: [
          {
            id: 'var-fake',
            color: 'Black',
            images: [{ url: '...', isPrimary: false }],
            skus: [{ skuCode: '...', size: '...', price: 10, mrp: 10 }],
          },
        ],
      };

      await expect(
        service.updateProduct('prod-1', sellerId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Product status transitions', () => {
    it('should prevent submission of incomplete draft', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: PRODUCT_STATUS.DRAFT,
        sellerId: 'seller-1',
        description: null, // missing
        categoryId: 'cat-1',
        brandId: 'brand-1',
      });

      await expect(
        service.transitionProductStatus(
          'prod-1',
          'SUBMIT',
          ['SELLER'],
          'seller-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should submit complete draft for review', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: PRODUCT_STATUS.DRAFT,
        sellerId: 'seller-1',
        description: 'Warm winter jacket',
        categoryId: 'cat-1',
        brandId: 'brand-1',
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'prod-1',
        status: PRODUCT_STATUS.PENDING_REVIEW,
      });

      const updated = await service.transitionProductStatus(
        'prod-1',
        'SUBMIT',
        ['SELLER'],
        'seller-1',
      );
      expect(updated.status).toBe(PRODUCT_STATUS.PENDING_REVIEW);
    });

    it('should escalate roles check for admin moderation actions', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: PRODUCT_STATUS.PENDING_REVIEW,
      });

      await expect(
        service.transitionProductStatus('prod-1', 'APPROVE', ['SELLER']),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
