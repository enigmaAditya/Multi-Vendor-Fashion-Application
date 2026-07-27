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

describe('Payouts & Commission Settlements System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let payoutsService: PayoutsService;

  let sellerId: string;
  let sellerToken: string;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    // Set mock Razorpay keys so API mock triggers smoothly
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
    adminId = crypto.randomUUID();

    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
    sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'] },
      { secret, expiresIn: '15m' },
    );
    adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'] },
      { secret, expiresIn: '15m' },
    );
  });

  beforeEach(async () => {
    await prisma.promotionLedger.deleteMany({});
    await prisma.couponRedemption.deleteMany({});
    await prisma.coupon.deleteMany({});
    await prisma.commissionLedger.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.sellerLinkedAccount.deleteMany({});
    await prisma.commissionRule.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.subOrder.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryReservation.deleteMany({});
    await prisma.inventoryLedger.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed User
    await prisma.user.create({
      data: { id: sellerId, phone: '+919999999991', roles: ['SELLER'] },
    });
    await prisma.user.create({
      data: { id: adminId, phone: '+919999999995', roles: ['ADMIN'] },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('should deliver confirmed orders, compute settlements, cancel payouts on return, and recover stranded state on crash-retries', async () => {
    // 1. Setup Base Database records
    const cat = await prisma.category.create({
      data: { name: 'Apparel', slug: 'apparel', path: 'apparel' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Denim Jacket',
        slug: 'denim-jacket',
        sellerId,
        categoryId: cat.id,
        status: 'LIVE',
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
        price: BigInt(5000), // Rs 50
        mrp: BigInt(6000),
      },
    });

    const order = await prisma.order.create({
      data: {
        buyerId: adminId,
        totalAmount: BigInt(5000),
        gatewayOrderId: 'order_mock1',
        paymentStatus: 'PAID',
        shippingAddress: { city: 'Mumbai' },
      },
    });

    const subOrder = await prisma.subOrder.create({
      data: {
        orderId: order.id,
        sellerId,
        amount: BigInt(5000),
        status: 'CONFIRMED',
      },
    });

    await prisma.orderItem.create({
      data: {
        subOrderId: subOrder.id,
        skuId: sku.id,
        quantity: 1,
        price: BigInt(5000),
        mrp: BigInt(6000),
      },
    });

    // 2. Link Seller Account via API
    await request(app.getHttpServer())
      .post('/payouts/sellers/payout-account')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ gatewayAccountId: 'acc_seller_mock123' })
      .expect(201);

    await prisma.sellerLinkedAccount.update({
      where: { sellerId },
      data: { status: 'ACTIVE' },
    });

    // 3. Simulating processDelivery Admin call
    await request(app.getHttpServer())
      .post(`/payouts/admin/sub-orders/${subOrder.id}/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ escrowDelaySeconds: 900 }) // escrow delay
      .expect(201);

    // Verify subOrder is updated to DELIVERED and PENDING settlement
    const dbSubOrder = await prisma.subOrder.findUnique({
      where: { id: subOrder.id },
    });
    expect(dbSubOrder?.status).toBe('DELIVERED');
    expect(dbSubOrder?.settlementStatus).toBe('PENDING');

    // 4. Return Cancellation Flow Race verification
    // Mark another sub-order to deliver then cancel
    const subOrder2 = await prisma.subOrder.create({
      data: {
        orderId: order.id,
        sellerId,
        amount: BigInt(5000),
        status: 'CONFIRMED',
      },
    });
    await prisma.orderItem.create({
      data: {
        subOrderId: subOrder2.id,
        skuId: sku.id,
        quantity: 1,
        price: BigInt(5000),
        mrp: BigInt(6000),
      },
    });

    // Deliver order 2
    await payoutsService.processDelivery(subOrder2.id, 900);
    // Cancel payout 2 (simulating buyer requesting return)
    const cancelRes = await payoutsService.cancelPayout(subOrder2.id);
    expect(cancelRes.success).toBe(true);

    const cancelledSub = await prisma.subOrder.findUnique({
      where: { id: subOrder2.id },
    });
    expect(cancelledSub?.settlementStatus).toBe('CANCELED');

    // Attempting to settle a canceled sub-order should do nothing
    await payoutsService.settlePayout(subOrder2.id);
    const cancelPayoutRow = await prisma.payout.findUnique({
      where: { subOrderId: subOrder2.id },
    });
    expect(cancelPayoutRow).toBeNull(); // No payout generated

    // 5. Crash-Retry Idempotency & State Recovery Flow (Notes 8 / 1 / 3)
    const mockTransferId = 'trf_payout_e2e_456';
    let fetchCallCount = 0;
    const mockFetch = jest.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: mockTransferId }),
      });
    });
    global.fetch = mockFetch;

    // We stub a crash scenario on the database transaction step during the first attempt.
    // To do this, we can temporarily intercept/mock `$transaction` to fail once.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalTx = prisma.$transaction;
    let hasCrashed = false;
    prisma.$transaction = jest
      .fn()
      .mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        if (!hasCrashed) {
          hasCrashed = true;
          // Simulate crash right after the mock fetch call completes successfully
          throw new Error('Database connection reset during commit outcome.');
        }
        // Revert to original transaction behavior for subsequent calls
        return originalTx.call(prisma, callback);
      });

    // Run settlePayout first time -> should crash/throw
    await expect(payoutsService.settlePayout(subOrder.id)).rejects.toThrow(
      'Database connection reset during commit outcome.',
    );

    // Verify Payout was created as PENDING, but SubOrder is still SETTLING and ledger is empty
    const strandedPayout = await prisma.payout.findUnique({
      where: { subOrderId: subOrder.id },
    });
    expect(strandedPayout?.status).toBe('PENDING'); // Pre-created row exists
    expect(fetchCallCount).toBe(1); // Gateway transfer was sent

    const strandedSubOrder = await prisma.subOrder.findUnique({
      where: { id: subOrder.id },
    });
    expect(strandedSubOrder?.settlementStatus).toBe('SETTLING');

    const emptyLedger = await prisma.commissionLedger.findMany({
      where: { subOrderId: subOrder.id },
    });
    expect(emptyLedger.length).toBe(0);

    // Restore original transaction mapping
    prisma.$transaction = originalTx;

    // Run settlePayout second time (representing retry) -> should succeed and heal state
    const retryRes = await payoutsService.settlePayout(subOrder.id);
    expect(retryRes.success).toBe(true);

    // Verify self-healed state
    const resolvedPayout = await prisma.payout.findUnique({
      where: { subOrderId: subOrder.id },
    });
    expect(resolvedPayout?.status).toBe('SUCCESS');
    expect(resolvedPayout?.gatewayTransferId).toBe(mockTransferId);

    const resolvedSubOrder = await prisma.subOrder.findUnique({
      where: { id: subOrder.id },
    });
    expect(resolvedSubOrder?.settlementStatus).toBe('SETTLED');

    // Confirm that double outbox events are prevented and exactly ONE payout.settled event is written
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { eventType: 'payout.settled' },
    });
    expect(outboxEvents.length).toBe(1);

    // Verify ledger balance logs (summed and reconciled)
    const ledgerLogs = await prisma.commissionLedger.findMany({
      where: { subOrderId: subOrder.id },
    });
    expect(ledgerLogs.length).toBe(1);
    expect(ledgerLogs[0].amount).toBe(BigInt(250)); // Default 5% rate on 5000 paise subOrder total
  });
});
