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
import { JwtService } from '@nestjs/jwt';
import { signTestToken } from './utils/auth-helper';

describe('Reviews System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let sellerId: string;
  let buyerId: string;
  let nonBuyerId: string;
  let adminId: string;
  let buyerToken: string;
  let nonBuyerToken: string;
  let adminToken: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    sellerId = crypto.randomUUID();
    buyerId = crypto.randomUUID();
    nonBuyerId = crypto.randomUUID();
    adminId = crypto.randomUUID();

    buyerToken = await signTestToken(jwtService, {
      sub: buyerId,
      roles: ['USER'],
      token_version: 0,
    });
    nonBuyerToken = await signTestToken(jwtService, {
      sub: nonBuyerId,
      roles: ['USER'],
      token_version: 0,
    });
    adminToken = await signTestToken(jwtService, {
      sub: adminId,
      roles: ['ADMIN'],
      token_version: 0,
    });
  });

  beforeEach(async () => {
    // Clean up in dependency order
    await prisma.review.deleteMany({});
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

    // Seed users
    await prisma.user.create({
      data: { id: sellerId, phone: '+919999999991', roles: ['SELLER'] },
    });
    await prisma.user.create({
      data: { id: buyerId, phone: '+919999999992', roles: ['USER'] },
    });
    await prisma.user.create({
      data: { id: nonBuyerId, phone: '+919999999993', roles: ['USER'] },
    });
    await prisma.user.create({
      data: { id: adminId, phone: '+919999999994', roles: ['ADMIN'] },
    });

    // Seed product chain: Category → Product → Variant → SKU
    const cat = await prisma.category.create({
      data: { name: 'Apparel', slug: 'apparel-reviews', path: 'apparel' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Review Test Product',
        slug: 'review-test-product',
        sellerId,
        categoryId: cat.id,
        status: 'LIVE',
      },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: { productId: product.id, color: 'Blue' },
    });

    const sku = await prisma.sku.create({
      data: {
        variantId: variant.id,
        skuCode: 'RTP-BLU-M',
        sellerId,
        size: 'M',
        price: BigInt(2000),
        mrp: BigInt(3000),
      },
    });

    // Seed a completed PAID order for the buyer
    // This walks: Order (PAID) → SubOrder → OrderItem → Sku → Variant → Product
    await prisma.order.create({
      data: {
        id: crypto.randomUUID(),
        buyerId,
        totalAmount: BigInt(2000),
        paymentStatus: 'PAID',
        gatewayOrderId: `order_gw_${crypto.randomUUID()}`,
        shippingAddress: { city: 'Mumbai' },
        subOrders: {
          create: {
            sellerId,
            amount: BigInt(2000),
            status: 'CONFIRMED',
            items: {
              create: {
                skuId: sku.id,
                quantity: 1,
                price: BigInt(2000),
                mrp: BigInt(3000),
              },
            },
          },
        },
      },
    });
    // Non-buyer has NO order — intentionally left without any purchase
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /reviews', () => {
    it('should block a non-purchaser from creating a review', async () => {
      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${nonBuyerToken}`)
        .send({
          productId,
          rating: 5,
          title: 'Fake review',
          comment: 'I never bought this',
        })
        .expect(403);

      const body = res.body as { message?: string };
      expect(body.message).toContain('verified purchasers');
    });

    it('should allow a verified purchaser to create a review', async () => {
      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productId,
          rating: 4,
          title: 'Great product',
          comment: 'Loved the quality',
        })
        .expect(201);

      const body = res.body as {
        id?: string;
        productId?: string;
        buyerId?: string;
        rating?: number;
        status?: string;
        orderId?: string;
        skuId?: string;
      };
      expect(body.id).toBeDefined();
      expect(body.productId).toBe(productId);
      expect(body.buyerId).toBe(buyerId);
      expect(body.rating).toBe(4);
      expect(body.status).toBe('APPROVED');
      // Verify orderId and skuId are captured for provenance
      expect(body.orderId).toBeDefined();
      expect(body.skuId).toBeDefined();

      // Verify outbox event was written with productId
      const outbox = await prisma.outboxEvent.findFirst({
        where: { eventType: 'product.updated' },
        orderBy: { createdAt: 'desc' },
      });
      expect(outbox).toBeDefined();
      const payload = outbox!.payload as { productId?: string };
      expect(payload.productId).toBe(productId);
    });

    it('should return 409 on duplicate review and suggest PATCH', async () => {
      // First review
      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 5, title: 'First' })
        .expect(201);

      // Duplicate
      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 3, title: 'Second' })
        .expect(409);

      const body = res.body as { message?: string };
      expect(body.message).toContain('already reviewed');
    });

    it('should sanitize HTML in title and comment', async () => {
      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productId,
          rating: 5,
          title: '<script>alert("xss")</script>',
          comment: 'Rating < 5 & "great"',
        })
        .expect(201);

      const body = res.body as { title?: string; comment?: string };
      expect(body.title).not.toContain('<script>');
      expect(body.title).toContain('&lt;script&gt;');
      expect(body.comment).toContain('&lt;');
      expect(body.comment).toContain('&amp;');
    });

    it('should reject invalid rating values', async () => {
      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 0 })
        .expect(400);

      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 6 })
        .expect(400);
    });
  });

  describe('PATCH /reviews/:id', () => {
    it('should allow the owner to update their review', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 3, title: 'OK' })
        .expect(201);

      const reviewId = (createRes.body as { id: string }).id;

      const updateRes = await request(app.getHttpServer())
        .patch(`/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ rating: 5, title: 'Actually great!' })
        .expect(200);

      const body = updateRes.body as { rating?: number; title?: string };
      expect(body.rating).toBe(5);
      expect(body.title).toBe('Actually great!');
    });
  });

  describe('DELETE /reviews/:id', () => {
    it('should allow the owner to delete their review', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 4, comment: 'Nice' })
        .expect(201);

      const reviewId = (createRes.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(`/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      // Verify it's gone
      const review = await prisma.review.findUnique({
        where: { id: reviewId },
      });
      expect(review).toBeNull();
    });
  });

  describe('PATCH /admin/reviews/:id/moderate', () => {
    it('should allow admin to reject a review and emit product.updated', async () => {
      // Create review first
      const createRes = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 1, comment: 'Spam content' })
        .expect(201);

      const reviewId = (createRes.body as { id: string }).id;

      // Clear outbox to isolate the moderation event
      await prisma.outboxEvent.deleteMany({});

      // Admin rejects the review
      const modRes = await request(app.getHttpServer())
        .patch(`/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED' })
        .expect(200);

      const body = modRes.body as { status?: string };
      expect(body.status).toBe('REJECTED');

      // Verify product.updated outbox event was re-emitted
      const outbox = await prisma.outboxEvent.findFirst({
        where: { eventType: 'product.updated' },
      });
      expect(outbox).toBeDefined();
      const payload = outbox!.payload as { productId?: string };
      expect(payload.productId).toBe(productId);
    });

    it('should block non-admin from moderating', async () => {
      await request(app.getHttpServer())
        .patch('/admin/reviews/fake-id/moderate')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ status: 'REJECTED' })
        .expect(403);
    });
  });

  describe('GET /products/:productId/reviews', () => {
    it('should return only APPROVED reviews in paginated form', async () => {
      // Create an approved review
      const createRes = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 5, title: 'Excellent', comment: 'A+' })
        .expect(201);

      const reviewId = (createRes.body as { id: string }).id;

      // Admin rejects it
      await request(app.getHttpServer())
        .patch(`/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED' })
        .expect(200);

      // Public listing should return 0 reviews (rejected is hidden)
      const listRes = await request(app.getHttpServer())
        .get(`/products/${productId}/reviews`)
        .expect(200);

      const body = listRes.body as {
        reviews?: unknown[];
        total?: number;
      };
      expect(body.total).toBe(0);
      expect(body.reviews).toHaveLength(0);
    });
  });

  describe('GET /products/:productId/reviews/stats', () => {
    it('should return DB-aggregated stats for APPROVED reviews only', async () => {
      // Create a review (APPROVED by default)
      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, rating: 4, title: 'Good' })
        .expect(201);

      const statsRes = await request(app.getHttpServer())
        .get(`/products/${productId}/reviews/stats`)
        .expect(200);

      const body = statsRes.body as {
        averageRating?: number;
        totalReviews?: number;
        distribution?: Record<string, number>;
      };
      expect(body.averageRating).toBe(4);
      expect(body.totalReviews).toBe(1);
      expect(body.distribution?.['4']).toBe(1);
      expect(body.distribution?.['5']).toBe(0);
    });
  });
});
