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

describe('Admin Panel & Security Sweep (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  let buyerToken: string;
  let sellerToken: string;
  let adminToken: string;

  let buyerId: string;
  let sellerId: string;
  let adminId: string;

  let categoryId: string;
  let productId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    authService = app.get<AuthService>(AuthService);

    // Cleanup
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
    await prisma.commissionRule.deleteMany();
    await prisma.sellerLinkedAccount.deleteMany();
    await prisma.user.deleteMany();

    // 1. Create Buyer
    buyerId = crypto.randomUUID();
    const buyer = await prisma.user.create({
      data: { id: buyerId, phone: '+919876543210', roles: ['BUYER'] },
    });
    buyerToken = (await authService.issueTokens(buyer)).accessToken;

    // 2. Create Seller
    sellerId = crypto.randomUUID();
    const seller = await prisma.user.create({
      data: { id: sellerId, phone: '+919876543211', roles: ['SELLER'] },
    });
    sellerToken = (await authService.issueTokens(seller)).accessToken;

    // 3. Create Admin
    adminId = crypto.randomUUID();
    const admin = await prisma.user.create({
      data: { id: adminId, phone: '+919876543212', roles: ['ADMIN'] },
    });
    adminToken = (await authService.issueTokens(admin)).accessToken;

    // 4. Create Category & Product in PENDING_REVIEW status
    const cat = await prisma.category.create({
      data: {
        name: 'Admin Test Category',
        slug: 'admin-test-cat',
        path: 'admin-test-cat',
      },
    });
    categoryId = cat.id;

    const p = await prisma.product.create({
      data: {
        sellerId,
        categoryId,
        name: 'Pending Jacket',
        slug: 'pending-jacket',
        status: 'PENDING_REVIEW',
      },
    });
    productId = p.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // SECURITY SWEEP: 403 Forbidden on EVERY /admin/* route for Non-Admins
  // =========================================================================
  describe('Security Sweep — Non-Admin Authorization Gate', () => {
    const adminRoutes: Array<{
      method: 'get' | 'post' | 'patch';
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: 'get', path: '/admin/sellers' },
      {
        method: 'patch',
        path: `/admin/sellers/${crypto.randomUUID()}/kyc`,
        body: { status: 'APPROVED' },
      },
      { method: 'post', path: '/admin/commissions', body: { ratePercent: 5 } },
      { method: 'get', path: '/admin/catalog/moderation-queue' },
      {
        method: 'patch',
        path: `/admin/catalog/products/${crypto.randomUUID()}/status`,
        body: { status: 'LIVE' },
      },
      {
        method: 'patch',
        path: `/admin/reviews/${crypto.randomUUID()}/moderate`,
        body: { status: 'APPROVED' },
      },
      { method: 'get', path: '/admin/finance/summary' },
    ];

    it('should return 403 Forbidden for BUYER on every /admin route', async () => {
      for (const route of adminRoutes) {
        const req = request(app.getHttpServer())
          [route.method](route.path)
          .set('Authorization', `Bearer ${buyerToken}`);

        if (route.body) {
          req.send(route.body);
        }

        await req.expect(403);
      }
    });

    it('should return 403 Forbidden for SELLER on every /admin route', async () => {
      for (const route of adminRoutes) {
        const req = request(app.getHttpServer())
          [route.method](route.path)
          .set('Authorization', `Bearer ${sellerToken}`);

        if (route.body) {
          req.send(route.body);
        }

        await req.expect(403);
      }
    });

    it('should return 401 Unauthorized for Unauthenticated requests on every /admin route', async () => {
      for (const route of adminRoutes) {
        const req = request(app.getHttpServer())[route.method](route.path);

        if (route.body) {
          req.send(route.body);
        }

        await req.expect(401);
      }
    });
  });

  // =========================================================================
  // OPERATOR FLOWS: Admin Token Success Verification
  // =========================================================================
  describe('Operator Control Surface (ADMIN Token)', () => {
    it('should list sellers and approve seller KYC', async () => {
      // List sellers
      const listRes = await request(app.getHttpServer())
        .get('/admin/sellers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(listRes.body)).toBe(true);

      // Approve seller KYC
      const approveRes = await request(app.getHttpServer())
        .patch(`/admin/sellers/${sellerId}/kyc`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(approveRes.body.status).toBe('ACTIVE');

      // Verify seller.approved outbox event emitted
      const outbox = await prisma.outboxEvent.findFirst({
        where: { eventType: 'seller.approved' },
      });
      expect(outbox).not.toBeNull();
    });

    it('should set category commission rule', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/commissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ categoryId, ratePercent: 7.5 })
        .expect(200);

      expect(res.body.ratePercent).toBe(7.5);
      expect(res.body.categoryId).toBe(categoryId);
    });

    it('should list moderation queue and approve product (emits product.updated outbox event)', async () => {
      // List moderation queue
      const queueRes = await request(app.getHttpServer())
        .get('/admin/catalog/moderation-queue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(queueRes.body).toHaveLength(1);
      expect(queueRes.body[0].id).toBe(productId);

      // Approve product status to LIVE
      const modRes = await request(app.getHttpServer())
        .patch(`/admin/catalog/products/${productId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'LIVE' })
        .expect(200);

      expect(modRes.body.status).toBe('LIVE');

      // Verify product.updated outbox event emitted for Search re-indexing
      const outbox = await prisma.outboxEvent.findFirst({
        where: {
          eventType: 'product.updated',
          payload: { path: ['productId'], equals: productId },
        },
      });
      expect(outbox).not.toBeNull();
    });

    it('should fetch financial summary from ledgers', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/finance/summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.gmv).toBe('0');
      expect(res.body.totalCommission).toBe('0');
      expect(res.body.totalPayouts).toBe('0');
      expect(res.body.platformPromoExpenses).toBe('0');
    });
  });
});
