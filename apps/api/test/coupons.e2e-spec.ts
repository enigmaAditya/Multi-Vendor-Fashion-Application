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
import { PayoutsService } from '../src/payouts/payouts.service';

describe('Coupons & Promotions System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let payoutsService: PayoutsService;

  let sellerId: string;
  let buyerId: string;
  let buyer2Id: string;
  let adminId: string;
  let buyerToken: string;
  let buyer2Token: string;
  let adminToken: string;
  let skuId: string;

  beforeAll(async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mockkey';
    process.env.RAZORPAY_KEY_SECRET = 'mocksecret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);
    payoutsService = app.get<PayoutsService>(PayoutsService);

    sellerId = crypto.randomUUID();
    buyerId = crypto.randomUUID();
    buyer2Id = crypto.randomUUID();
    adminId = crypto.randomUUID();

    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
    buyerToken = await jwtService.signAsync(
      { sub: buyerId, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
    buyer2Token = await jwtService.signAsync(
      { sub: buyer2Id, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
    adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'] },
      { secret, expiresIn: '15m' },
    );
  });

  beforeEach(async () => {
    // Clean up databases in dependency order
    await prisma.promotionLedger.deleteMany({});
    await prisma.couponRedemption.deleteMany({});
    await prisma.coupon.deleteMany({});
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
      data: { id: buyer2Id, phone: '+919999999993', roles: ['USER'] },
    });
    await prisma.user.create({
      data: { id: adminId, phone: '+919999999994', roles: ['ADMIN'] },
    });

    // Seed Warehouse, Category, Product, Variant, SKU
    const warehouse = await prisma.warehouse.create({
      data: { name: 'Coupon WH', code: 'CPN-WH' },
    });
    const category = await prisma.category.create({
      data: { name: 'Fashion', slug: 'fashion', path: 'fashion' },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Coupon Test Hoodie',
        slug: 'coupon-test-hoodie',
        sellerId,
        categoryId: category.id,
        status: 'LIVE',
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, color: 'Black' },
    });
    const sku = await prisma.sku.create({
      data: {
        variantId: variant.id,
        skuCode: 'HOODIE-BLK-L',
        sellerId,
        size: 'L',
        price: BigInt(100000), // ₹1,000 (100000 paise)
        mrp: BigInt(120000),
      },
    });
    skuId = sku.id;

    await prisma.skuInventory.create({
      data: {
        skuId: sku.id,
        warehouseId: warehouse.id,
        onHand: 100,
        reserved: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('Coupon Checkout & Gateway Net Amount Charging', () => {
    it('should charge Razorpay net amountCharged (not totalAmount) and create PromotionLedger expense', async () => {
      // 1. Create a platform-funded ₹200 (20000 paise) coupon
      await prisma.coupon.create({
        data: {
          code: 'FLAT200',
          discountType: 'FIXED',
          discountValue: BigInt(20000),
          fundingType: 'PLATFORM',
          minOrderAmount: BigInt(50000), // ₹500 min
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      // 2. Mock Razorpay fetch API
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'order_gw_cpn123' }),
      });
      global.fetch = mockFetch;

      // 3. Checkout with coupon FLAT200 (cart total = ₹1,000 = 100000 paise)
      const res = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          cartItems: [{ skuId, quantity: 1 }],
          shippingAddress: { city: 'Mumbai', street: 'MG Road' },
          couponCode: 'flat200', // Lowercase test
        })
        .expect(201);

      const body = res.body as {
        orderId: string;
        gatewayOrderId: string;
        totalAmount: string;
        discountAmount: string;
        amountCharged: string;
      };

      expect(body.totalAmount).toBe('100000'); // ₹1,000 pre-discount
      expect(body.discountAmount).toBe('20000'); // ₹200 discount
      expect(body.amountCharged).toBe('80000'); // ₹800 net charged

      // Verify Razorpay gateway call received amountCharged (80000 paise)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.razorpay.com/v1/orders',
        expect.objectContaining({
          body: expect.stringContaining('"amount":80000'),
        }),
      );

      // Verify Order record in database
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: body.orderId },
        include: { promotionLedger: true, couponRedemption: true },
      });
      expect(order.totalAmount).toBe(BigInt(100000));
      expect(order.discountAmount).toBe(BigInt(20000));
      expect(order.amountCharged).toBe(BigInt(80000));
      expect(order.promotionLedger).toHaveLength(1);
      expect(order.promotionLedger[0].amount).toBe(BigInt(20000));
      expect(order.promotionLedger[0].type).toBe('PLATFORM_PROMO_EXPENSE');
    });
  });

  describe('Deep Discount Settlement & Payout Reconciliation', () => {
    it('should settle payout cleanly when platform discount exceeds commission without breaking line-231 reconciliation', async () => {
      // 1. Setup 10% commission rule for category
      const category = await prisma.category.findFirstOrThrow();
      await prisma.commissionRule.create({
        data: { categoryId: category.id, ratePercent: 10.0 }, // 10% commission
      });

      // 2. Create ₹250 (25000 paise) platform coupon on ₹1,000 item. Commission is ₹100 (10000 paise).
      // Discount (25000) > Commission (10000).
      await prisma.coupon.create({
        data: {
          code: 'DEEP250',
          discountType: 'FIXED',
          discountValue: BigInt(25000),
          fundingType: 'PLATFORM',
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await prisma.sellerLinkedAccount.create({
        data: {
          sellerId,
          gatewayAccountId: 'acc_seller_deep250',
          status: 'ACTIVE',
        },
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'order_gw_deep250',
            id_transfer: 'trf_deep250',
          }),
      });

      // 3. Checkout
      const checkoutRes = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          cartItems: [{ skuId, quantity: 1 }],
          shippingAddress: { city: 'Mumbai' },
          couponCode: 'DEEP250',
        })
        .expect(201);

      const orderId = (checkoutRes.body as { orderId: string }).orderId;

      // 4. Mark order paid and sub-order delivered
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', gatewayPaymentId: 'pay_deep250' },
      });
      const subOrder = await prisma.subOrder.findFirstOrThrow({
        where: { orderId },
      });
      await prisma.subOrder.update({
        where: { id: subOrder.id },
        data: { status: 'CONFIRMED' },
      });

      // 5. Process payout delivery settlement
      await payoutsService.processDelivery(subOrder.id);
      await payoutsService.settlePayout(subOrder.id);

      const payoutResult = await prisma.payout.findUniqueOrThrow({
        where: { subOrderId: subOrder.id },
      });

      expect(payoutResult).toBeDefined();
      expect(payoutResult.status).toBe('SUCCESS');

      // Verify seller payout: Item ₹1,000 (100000 paise) - 10% Commission (10000 paise) = Net ₹900 (90000 paise).
      // Seller gets full ₹900 net payout untouched!
      expect(payoutResult.amount).toBe(BigInt(90000));

      // Verify Commission Ledger
      const commLedger = await prisma.commissionLedger.findFirstOrThrow({
        where: { subOrderId: subOrder.id },
      });
      expect(commLedger.amount).toBe(BigInt(10000)); // ₹100 commission

      // Verify Promotion Ledger has recorded ₹250 platform promo expense
      const promoLedger = await prisma.promotionLedger.findFirstOrThrow({
        where: { orderId },
      });
      expect(promoLedger.amount).toBe(BigInt(25000));
    });
  });

  describe('Concurrency & Per-User Redemption Limits', () => {
    it('should allow exactly 1 claim for a single-use coupon under 5 concurrent checkouts', async () => {
      // Create single-use coupon maxRedemptions = 1
      const coupon = await prisma.coupon.create({
        data: {
          code: 'SINGLE1',
          discountType: 'FIXED',
          discountValue: BigInt(10000),
          maxRedemptions: 1,
          maxRedemptionsPerUser: 1,
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: `order_gw_conc_${crypto.randomUUID()}` }),
      });

      // Fire 5 concurrent checkout requests using single1
      const promises = Array.from({ length: 5 }).map(() =>
        request(app.getHttpServer())
          .post('/orders/checkout')
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({
            cartItems: [{ skuId, quantity: 1 }],
            shippingAddress: { city: 'Mumbai' },
            couponCode: 'SINGLE1',
          }),
      );

      const results = await Promise.all(promises);

      const successfulClaims = results.filter((r) => r.status === 201);
      const failedClaims = results.filter((r) => r.status === 400);

      // Assert exactly 1 checkout claimed the coupon
      expect(successfulClaims).toHaveLength(1);
      expect(failedClaims).toHaveLength(4);

      // Verify currentRedemptions counter on coupon is exactly 1
      const updatedCoupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(updatedCoupon.currentRedemptions).toBe(1);
    });

    it('should block a second checkout from the same user when maxRedemptionsPerUser is 1', async () => {
      await prisma.coupon.create({
        data: {
          code: 'ONCEPERUSER',
          discountType: 'FIXED',
          discountValue: BigInt(5000),
          maxRedemptions: 10,
          maxRedemptionsPerUser: 1,
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: `order_gw_user_${crypto.randomUUID()}` }),
      });

      // First checkout by buyerId
      await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          cartItems: [{ skuId, quantity: 1 }],
          shippingAddress: { city: 'Mumbai' },
          couponCode: 'ONCEPERUSER',
        })
        .expect(201);

      // Second checkout attempt by buyerId with same coupon
      const res = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          cartItems: [{ skuId, quantity: 1 }],
          shippingAddress: { city: 'Mumbai' },
          couponCode: 'ONCEPERUSER',
        })
        .expect(400);

      const body = res.body as { message?: string };
      expect(body.message).toContain('maximum allowed redemptions');
    });
  });
});
