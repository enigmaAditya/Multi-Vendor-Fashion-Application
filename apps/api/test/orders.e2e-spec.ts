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

describe('Orders & Checkout System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let sellerId: string;
  let buyerId: string;
  let sellerToken: string;
  let buyerToken: string;

  const mockSecret = 'webhooksecret';

  beforeAll(async () => {
    // Set mock webhook secret
    process.env.RAZORPAY_WEBHOOK_SECRET = mockSecret;
    // Set mock Razorpay keys so API mock triggers smoothly
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mockkey';
    process.env.RAZORPAY_KEY_SECRET = 'mocksecret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Enable rawBody in Nest E2E test runner (Note 2)
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    sellerId = crypto.randomUUID();
    buyerId = crypto.randomUUID();

    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
    sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'] },
      { secret, expiresIn: '15m' },
    );
    buyerToken = await jwtService.signAsync(
      { sub: buyerId, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
  });

  beforeEach(async () => {
    // Clean up
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
    await prisma.sku.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed User
    await prisma.user.create({
      data: { id: sellerId, phone: '+919999999991', roles: ['SELLER'] },
    });
    await prisma.user.create({
      data: { id: buyerId, phone: '+919999999992', roles: ['USER'] },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('should prevent pricing tampering and recompute order totals from DB', async () => {
    // 1. Setup Warehouse and Stock
    const warehouse = await prisma.warehouse.create({
      data: { name: 'E2E Warehouse', code: 'E2E-WH' },
    });

    const cat = await prisma.category.create({
      data: { name: 'Apparel', slug: 'apparel', path: 'apparel' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Denim Jacket',
        slug: 'denim-jacket',
        sellerId,
        categoryId: cat.id,
        status: 'LIVE', // LIVE status required
      },
    });

    const variant = await prisma.productVariant.create({
      data: { productId: product.id, color: 'Black' },
    });

    const sku = await prisma.sku.create({
      data: {
        variantId: variant.id,
        skuCode: 'DJACKET-BLK-L',
        sellerId,
        size: 'L',
        price: BigInt(5000), // Server Price: 5000 Paise (Rs 50)
        mrp: BigInt(6000),
      },
    });

    await prisma.skuInventory.create({
      data: {
        skuId: sku.id,
        warehouseId: warehouse.id,
        onHand: 10,
        reserved: 0,
      },
    });

    // 2. Mock Razorpay API response
    const mockOrderId = 'order_gw_mock123';
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: mockOrderId }),
    });
    global.fetch = mockFetch;

    // 3. Initialize checkout cart
    const checkoutRes = await request(app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        cartItems: [
          {
            skuId: sku.id,
            quantity: 3,
            price: 1, // Tampered client pricing: sent price as 1 paise instead of 5000
          },
        ],
        shippingAddress: { city: 'Mumbai', street: 'Bandra' },
      })
      .expect(201);

    expect(checkoutRes.body.gatewayOrderId).toBe(mockOrderId);
    // Verify that the server totalAmount is recomputed based on database prices (5000 * 3 = 15000)
    expect(checkoutRes.body.totalAmount).toBe('15000');

    // Assert that mock fetch was indeed called with the server-side recomputed amount (Note 11 / 7)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/orders',
      expect.objectContaining({
        body: expect.stringContaining('"amount":15000'),
      }),
    );
  });

  it('should handle standard payment capture, prevent duplicate webhooks, and process sweeper timeout failures', async () => {
    // Setup Warehouse, Stock, Product
    const warehouse = await prisma.warehouse.create({
      data: { name: 'E2E Warehouse 2', code: 'E2E-WH-2' },
    });
    const cat = await prisma.category.create({
      data: { name: 'Apparel 2', slug: 'apparel-2', path: 'apparel-2' },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Denim Shirt',
        slug: 'denim-shirt',
        sellerId,
        categoryId: cat.id,
        status: 'LIVE',
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, color: 'Blue' },
    });
    const sku = await prisma.sku.create({
      data: {
        variantId: variant.id,
        skuCode: 'DSHIRT-BLU-S',
        sellerId,
        size: 'S',
        price: BigInt(3000),
        mrp: BigInt(4000),
      },
    });
    await prisma.skuInventory.create({
      data: {
        skuId: sku.id,
        warehouseId: warehouse.id,
        onHand: 5,
        reserved: 0,
      },
    });

    let mockOrderCounter = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      mockOrderCounter++;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ id: `order_gw_mock_${mockOrderCounter}` }),
      });
    });

    // 1. Create the Order
    const checkoutRes = await request(app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        cartItems: [{ skuId: sku.id, quantity: 2 }],
        shippingAddress: { city: 'Pune' },
      })
      .expect(201);

    const {
      reservationCode,
      orderId,
      gatewayOrderId: mockOrderId1,
    } = checkoutRes.body;

    // 2. Simulate payment.captured event webhook
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_capture_123',
            order_id: mockOrderId1,
          },
        },
      },
    };
    const rawPayload = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', mockSecret)
      .update(rawPayload)
      .digest('hex');

    const eventId = 'evt_captured_abc';

    await request(app.getHttpServer())
      .post('/orders/webhook')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawPayload)
      .expect(201); // Created (200/201 webhook handles return success)

    // Verify order is PAID, sub-order is CONFIRMED, stock is committed
    const finalOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { subOrders: true },
    });
    expect(finalOrder?.paymentStatus).toBe('PAID');
    expect(finalOrder?.subOrders[0].status).toBe('CONFIRMED');

    const finalInv = await prisma.skuInventory.findUnique({
      where: {
        warehouseId_skuId: { warehouseId: warehouse.id, skuId: sku.id },
      },
    });
    // Deducted both: 5 - 2 = 3 onHand, 0 reserved
    expect(finalInv?.onHand).toBe(3);
    expect(finalInv?.reserved).toBe(0);

    // 3. Duplicate Webhook Check (Note 11): Fire the same webhook event ID again
    const dupRes = await request(app.getHttpServer())
      .post('/orders/webhook')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawPayload)
      .expect(201);

    expect(dupRes.body.message).toBe('Duplicate event');

    // 4. Expired Checkout Sweeper Race Check (Note 11):
    // Let's create a new order, simulate sweeper expiring holds, then confirm payment
    const checkoutRes2 = await request(app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        cartItems: [{ skuId: sku.id, quantity: 1 }],
        shippingAddress: { city: 'Pune' },
      })
      .expect(201);

    const orderId2 = checkoutRes2.body.orderId;
    const reservationCode2 = checkoutRes2.body.reservationCode;
    const mockOrderId2 = checkoutRes2.body.gatewayOrderId;

    // Simulate sweeper expiring/releasing this reservation
    await prisma.inventoryReservation.updateMany({
      where: { reservationCode: reservationCode2 },
      data: { status: 'RELEASED' },
    });
    // Decrement inventory reserved stock count back (mimicking releaseReservation sweeper)
    await prisma.skuInventory.update({
      where: {
        warehouseId_skuId: { warehouseId: warehouse.id, skuId: sku.id },
      },
      data: { reserved: 0 },
    });

    // Now capture payment for this expired hold order
    const webhookPayload2 = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_capture_456',
            order_id: mockOrderId2,
          },
        },
      },
    };
    const rawPayload2 = JSON.stringify(webhookPayload2);
    const signature2 = crypto
      .createHmac('sha256', mockSecret)
      .update(rawPayload2)
      .digest('hex');

    await request(app.getHttpServer())
      .post('/orders/webhook')
      .set('x-razorpay-signature', signature2)
      .set('x-razorpay-event-id', 'evt_captured_def')
      .set('Content-Type', 'application/json')
      .send(rawPayload2)
      .expect(201);

    // Verify order flags REFUND_REQUIRED, and stock remains unchanged
    const finalOrder2 = await prisma.order.findUnique({
      where: { id: orderId2 },
    });
    expect(finalOrder2?.paymentStatus).toBe('REFUND_REQUIRED');

    const finalInv2 = await prisma.skuInventory.findUnique({
      where: {
        warehouseId_skuId: { warehouseId: warehouse.id, skuId: sku.id },
      },
    });
    expect(finalInv2?.onHand).toBe(3); // Unchanged physical stock
  });
});
