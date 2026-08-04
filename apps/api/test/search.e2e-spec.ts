import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

try {
  const envContent = fs.readFileSync(
    path.resolve(__dirname, '../.env'),
    'utf8',
  );
  for (const line of envContent.split('\n')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts
        .slice(1)
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  }
} catch {
  // Ignore if file doesn't exist
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/search/search.service';
import { JwtService } from '@nestjs/jwt';

describe('Search & Discovery System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let searchService: SearchService;

  let adminId: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);
    searchService = app.get<SearchService>(SearchService);

    adminId = crypto.randomUUID();
    adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
  });

  beforeEach(async () => {
    // Clear databases thoroughly to prevent foreign key constraints
    await prisma.searchQueryLog.deleteMany({});
    await prisma.commissionLedger.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.sellerLinkedAccount.deleteMany({});
    await prisma.commissionRule.deleteMany({});
    await prisma.paymentWebhookLog.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.subOrder.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryReservation.deleteMany({});
    await prisma.inventoryLedger.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.productAttributeValueMap.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.brand.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
    await prisma.user.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /search', () => {
    it('should search products and return hits + facet counts', async () => {
      // Mock index search results programmatically on the service's index
      const mockSearch = jest.fn().mockResolvedValue({
        hits: [
          {
            id: 'prod-1',
            name: 'Cotton Polo Shirt',
            categoryName: 'Apparel',
            brandName: 'BrandX',
            minPrice: 20,
            maxPrice: 30,
            colors: ['Red'],
            sizes: ['M'],
            inStock: true,
            rating: 4.5,
          },
        ],
        estimatedTotalHits: 1,
        facetDistribution: {
          categoryName: { Apparel: 1 },
          brandName: { BrandX: 1 },
        },
      });

      (searchService as any).index.search = mockSearch;

      const response = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'polo', category: 'Apparel', minPrice: 15 })
        .expect(200);

      expect(response.body.hits).toBeDefined();
      expect(response.body.hits[0].name).toBe('Cotton Polo Shirt');
      expect(response.body.facetDistribution).toBeDefined();
      expect(response.body.facetDistribution.categoryName.Apparel).toBe(1);

      // Verify Meilisearch parameters translation
      expect(mockSearch).toHaveBeenCalledWith(
        'polo',
        expect.objectContaining({
          filter: 'categoryName = "Apparel" AND minPrice >= 15',
        }),
      );

      // Wait a moment for fire-and-forget query logging to settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify query is logged to SearchQueryLog table
      const logs = await prisma.searchQueryLog.findMany();
      expect(logs.length).toBe(1);
      expect(logs[0].query).toBe('polo');
      expect(logs[0].resultsCount).toBe(1);
      expect(JSON.parse(logs[0].filters || '[]')).toContain(
        'categoryName = "Apparel"',
      );
    });

    it('should filter by categoryId and resolve descendant categories from DB fallback', async () => {
      const seller = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          email: 'cat-seller@test.com',
          phone: '+919999888800',
          roles: ['SELLER'],
        },
      });
      const parentCat = await prisma.category.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Apparel',
          slug: 'apparel-parent',
          path: '/apparel',
        },
      });
      const childCat = await prisma.category.create({
        data: {
          id: crypto.randomUUID(),
          name: 'T-Shirts',
          slug: 'tshirts-child',
          parentId: parentCat.id,
          path: '/apparel/tshirts',
        },
      });
      const otherCat = await prisma.category.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Electronics',
          slug: 'electronics-other',
          path: '/electronics',
        },
      });

      const prodTshirt = await prisma.product.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Graphic Tee',
          slug: 'graphic-tee',
          status: 'LIVE',
          categoryId: childCat.id,
          sellerId: seller.id,
        },
      });
      await prisma.product.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Headphones',
          slug: 'headphones',
          status: 'LIVE',
          categoryId: otherCat.id,
          sellerId: seller.id,
        },
      });

      (
        searchService as unknown as { index: { search: jest.Mock } }
      ).index.search = jest
        .fn()
        .mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      const response = await request(app.getHttpServer())
        .get('/search')
        .query({ categoryId: parentCat.id })
        .expect(200);

      expect(response.body.hits).toHaveLength(1);
      expect(response.body.hits[0].id).toBe(prodTshirt.id);
      expect(response.body.hits[0].name).toBe('Graphic Tee');
    });
  });

  describe('POST /search/reindex', () => {
    it('should block non-admin reindex trigger', async () => {
      await request(app.getHttpServer()).post('/search/reindex').expect(401);
    });

    it('should trigger full reindexing backfill for admin', async () => {
      // Seed a LIVE product in the database
      const category = await prisma.category.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Apparel',
          slug: 'apparel',
          path: 'cat-x',
        },
      });
      const user = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          email: 'seller@example.com',
          passwordHash: 'hash',
          roles: ['SELLER'],
        },
      });

      await prisma.product.create({
        data: {
          id: crypto.randomUUID(),
          name: 'LIVE Item',
          slug: 'live-item',
          status: 'LIVE',
          categoryId: category.id,
          sellerId: user.id,
        },
      });

      // Mock index addDocuments to avoid hitting actual Meilisearch server
      const mockAddDocs = jest.fn().mockResolvedValue({});
      (searchService as any).index.addDocuments = mockAddDocs;

      const response = await request(app.getHttpServer())
        .post('/search/reindex')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.processedCount).toBe(1);
    });
  });
});
