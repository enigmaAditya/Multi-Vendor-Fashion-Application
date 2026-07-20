import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

try {
  const envContent = fs.readFileSync(
    path.resolve(__dirname, '../.env'),
    'utf8',
  );
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      const val = values.join('=').trim();
      if (key && val && !process.env[key.trim()]) {
        process.env[key.trim()] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
} catch {
  // Ignore if file doesn't exist
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

describe('Recommendations System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  let buyerToken: string;
  let buyerId: string;
  let sellerId: string;

  let categoryId: string;
  let brandId: string;
  let product1Id: string;
  let product2Id: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    authService = app.get<AuthService>(AuthService);

    // Clean up test data
    await prisma.userProductView.deleteMany();
    await prisma.promotionLedger.deleteMany();
    await prisma.couponRedemption.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.commissionLedger.deleteMany();
    await prisma.payout.deleteMany();
    await prisma.notificationLog.deleteMany();
    await prisma.userDeviceToken.deleteMany();
    await prisma.userNotificationPreference.deleteMany();
    await prisma.shipmentWebhookLog.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.subOrder.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryLedger.deleteMany();
    await prisma.skuInventory.deleteMany();
    await prisma.sku.deleteMany();
    await prisma.productImage.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.sellerLinkedAccount.deleteMany();
    await prisma.user.deleteMany();

    // 1. Create Buyer & Seller
    buyerId = crypto.randomUUID();
    const buyer = await prisma.user.create({
      data: { id: buyerId, phone: '+919911223344', roles: ['BUYER'] },
    });
    const tokens = await authService.issueTokens(buyer);
    buyerToken = tokens.accessToken;

    sellerId = crypto.randomUUID();
    await prisma.user.create({
      data: { id: sellerId, phone: '+919911223355', roles: ['SELLER'] },
    });

    // 2. Create Category & Brand
    const cat = await prisma.category.create({
      data: {
        name: 'Apparel Recs',
        slug: 'apparel-recs',
        path: 'apparel-recs',
      },
    });
    categoryId = cat.id;

    const brand = await prisma.brand.create({
      data: { name: 'Nike Recs', slug: 'nike-recs' },
    });
    brandId = brand.id;

    // 3. Create 2 LIVE active products
    const p1 = await prisma.product.create({
      data: {
        sellerId,
        categoryId,
        brandId,
        name: 'Alpha Running Shoe',
        slug: 'alpha-running-shoe',
        status: 'LIVE',
        variants: {
          create: [
            {
              color: 'Black',
              skus: {
                create: [
                  {
                    skuCode: 'ALPHA-RUN-BLK-9',
                    sellerId,
                    size: '9',
                    price: BigInt(600000),
                    mrp: BigInt(700000),
                  },
                ],
              },
            },
          ],
        },
      },
    });
    product1Id = p1.id;

    const p2 = await prisma.product.create({
      data: {
        sellerId,
        categoryId,
        brandId,
        name: 'Beta Running Shoe',
        slug: 'beta-running-shoe',
        status: 'LIVE',
        variants: {
          create: [
            {
              color: 'White',
              skus: {
                create: [
                  {
                    skuCode: 'BETA-RUN-WHT-9',
                    sellerId,
                    size: '9',
                    price: BigInt(650000),
                    mrp: BigInt(750000),
                  },
                ],
              },
            },
          ],
        },
      },
    });
    product2Id = p2.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('View Tracking & Recently Viewed API', () => {
    it('should track product view and retrieve in recently-viewed', async () => {
      // Track view for product 1
      await request(app.getHttpServer())
        .post(`/recommendations/views/${product1Id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      // Track view for product 2
      await request(app.getHttpServer())
        .post(`/recommendations/views/${product2Id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      // Fetch recently viewed
      const res = await request(app.getHttpServer())
        .get('/recommendations/recently-viewed')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(product2Id); // Most recently viewed first
      expect(res.body[1].id).toBe(product1Id);
    });
  });

  describe('Public Discovery Channels (Trending, Similar, Also-Bought)', () => {
    it('should return trending LIVE products', async () => {
      const res = await request(app.getHttpServer())
        .get('/recommendations/trending?limit=5')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].status).toBe('LIVE');
    });

    it('should return similar products in same category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/recommendations/similar/${product1Id}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product2Id);
    });

    it('should return co-purchased products with category fallback', async () => {
      const res = await request(app.getHttpServer())
        .get(`/recommendations/also-bought/${product1Id}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product2Id);
    });
  });
});
