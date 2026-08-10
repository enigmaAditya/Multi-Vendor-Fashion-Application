import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { flushRedis } from './utils/flush-redis';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { LogisticsProcessor } from '../src/logistics/logistics.processor';

describe('Logistics & Shiprocket Webhook (e2e)', () => {
  jest.setTimeout(25000);
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwtService: JwtService;

  const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_123';
  const webhookToken =
    process.env.SHIPROCKET_WEBHOOK_TOKEN || 'test_webhook_token';
  const buyerId = crypto.randomUUID();
  const sellerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const subOrderId = crypto.randomUUID();
  const skuId = 'sku-logistics-e2e-1';

  let adminToken: string;

  beforeAll(async () => {
    process.env.DISABLE_WORKERS = 'false';
    await flushRedis();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    redis = app.get<RedisService>(RedisService);
    jwtService = app.get<JwtService>(JwtService);

    // Mock fetch for Shiprocket auth and orders sync endpoints
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/auth/login')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'mock_token_abc' }),
        } as any);
      }
      if (typeof url === 'string' && url.includes('/orders/create/adhoc')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              shipment_id: 'ship-e2e-123',
              awb_code: 'awb-e2e-123',
              courier_name: 'BlueDart',
            }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any);
    });

    adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'] },
      { secret, expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clear Redis Cache
    await redis.getClient().flushall();

    // Clean up database tables
    await prisma.shipmentWebhookLog.deleteMany({});
    await prisma.commissionLedger.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.sellerLinkedAccount.deleteMany({});
    await prisma.commissionRule.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.subOrder.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.inventoryLedger.deleteMany({});
    await prisma.inventoryReservation.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.outboxEvent.deleteMany({});

    // Seed Core Entities
    await prisma.user.create({
      data: { id: buyerId, phone: '+919999999991', roles: ['USER'] },
    });
    await prisma.user.create({
      data: { id: sellerId, phone: '+919999999992', roles: ['SELLER'] },
    });

    const category = await prisma.category.create({
      data: { name: 'Apparel', slug: 'apparel', path: 'apparel' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Designer Hoody',
        slug: 'designer-hoody',
        categoryId: category.id,
        sellerId,
        status: 'LIVE',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        color: 'Black',
      },
    });

    await prisma.sku.create({
      data: {
        id: skuId,
        variantId: variant.id,
        sellerId,
        skuCode: 'HOODY-BLK-L',
        size: 'L',
        price: 300000n, // 3000.00 rupees
        mrp: 400000n,
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: { name: 'Central Logistics Hub', code: 'MAIN-WH' },
    });

    await prisma.skuInventory.create({
      data: {
        warehouseId: warehouse.id,
        skuId,
        onHand: 100,
        reserved: 0,
      },
    });
  });

  describe('Outbox-Driven Shipment Sync E2E', () => {
    it('should sweep outbox event of order.paid and asynchronously sync shipment to Shiprocket', async () => {
      // 1. Create a confirmed order & sub-order awaiting sync
      const warehouse = await prisma.warehouse.findFirstOrThrow();
      await prisma.order.create({
        data: {
          id: orderId,
          buyerId,
          gatewayOrderId: 'order_e2e_123',
          totalAmount: 300000n,
          paymentStatus: 'PAID',
          shippingAddress: {
            name: 'Jane Smith',
            address: '456 Ring Rd',
            city: 'Bangalore',
            pincode: '560001',
            state: 'Karnataka',
            phone: '+918888888888',
          },
        },
      });

      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          orderId,
          sellerId,
          amount: 300000n,
          status: 'CONFIRMED',
          shipmentStatus: 'PENDING_SYNC',
        },
      });

      await prisma.orderItem.create({
        data: {
          subOrderId,
          skuId,
          quantity: 1,
          price: 300000n,
          mrp: 400000n,
        },
      });

      // Insert COMPLETED inventory reservation mapping to Main Warehouse
      await prisma.inventoryReservation.create({
        data: {
          skuId,
          warehouseId: warehouse.id,
          userId: buyerId,
          orderId,
          reservationCode: 'res-code-e2e',
          quantity: 1,
          expiresAt: new Date(Date.now() + 60000),
          status: 'COMPLETED',
        },
      });

      // 2. Insert outbox event for order.paid
      await prisma.outboxEvent.create({
        data: {
          eventType: 'order.paid',
          payload: { orderId },
        },
      });

      // 3. Manually trigger LogisticsProcessor sweep
      const logisticsProcessor =
        app.get<LogisticsProcessor>(LogisticsProcessor);
      await logisticsProcessor.sweepOutbox();

      // 4. Wait for the async worker to actually process the job
      const waitForSync = async (id: string, timeoutMs = 10000) => {
        const start = Date.now();
        for (;;) {
          const so = await prisma.subOrder.findUniqueOrThrow({ where: { id } });
          if (so.shipmentStatus === 'SYNCED') return so;
          if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out; status still ${so.shipmentStatus}`);
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      };

      const subOrder = await waitForSync(subOrderId);

      expect(subOrder.shipmentStatus).toBe('SYNCED');
      expect(subOrder.shipmentId).toBe('ship-e2e-123');
      expect(subOrder.awbCode).toBe('awb-e2e-123');

      // Verify outbox event is marked processed
      const outboxEvent = await prisma.outboxEvent.findFirstOrThrow({
        where: { eventType: 'order.paid' },
      });
      expect(outboxEvent.processed).toBe(true);
    }, 10000); // 10s timeout
  });

  describe('Idempotent Webhook Delivery E2E', () => {
    it('should process DELIVERED webhook, transition status, and reject duplicate payloads', async () => {
      // 1. Setup synced sub-order
      await prisma.order.create({
        data: {
          id: orderId,
          buyerId,
          gatewayOrderId: 'order_e2e_456',
          totalAmount: 300000n,
          paymentStatus: 'PAID',
          shippingAddress: {},
        },
      });

      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          orderId,
          sellerId,
          amount: 300000n,
          status: 'CONFIRMED',
          shipmentStatus: 'SYNCED',
          awbCode: 'awb-e2e-123',
        },
      });

      // 2. Fire DELIVERED webhook for the first time
      await request(app.getHttpServer() as App)
        .post('/logistics/shiprocket-webhook')
        .set('x-api-key', webhookToken)
        .send({
          awb_code: 'awb-e2e-123',
          status: 'DELIVERED',
        })
        .expect(201);

      // Verify state transition
      const subOrder = await prisma.subOrder.findUniqueOrThrow({
        where: { id: subOrderId },
      });
      expect(subOrder.status).toBe('DELIVERED');
      expect(subOrder.deliveredAt).not.toBeNull();
      expect(subOrder.settlementStatus).toBe('PENDING');

      // Verify exactly one ShipmentWebhookLog is written
      const webhookLogsCount = await prisma.shipmentWebhookLog.count({
        where: { awbCode: 'awb-e2e-123', status: 'DELIVERED' },
      });
      expect(webhookLogsCount).toBe(1);

      // 3. Fire duplicate DELIVERED webhook
      const duplicateRes = await request(app.getHttpServer() as App)
        .post('/logistics/shiprocket-webhook')
        .set('x-api-key', webhookToken)
        .send({
          awb_code: 'awb-e2e-123',
          status: 'DELIVERED',
        })
        .expect(201);

      expect(duplicateRes.body.message).toBe('Duplicate webhook event.');
    });
  });

  describe('Pre/Post-Settlement RTO & Restocking E2E', () => {
    it('should cancel pending payouts and restock items during pre-settlement RTO events', async () => {
      const warehouse = await prisma.warehouse.findFirstOrThrow();

      // 1. Setup confirmed order & items
      await prisma.order.create({
        data: {
          id: orderId,
          buyerId,
          gatewayOrderId: 'order_e2e_789',
          totalAmount: 300000n,
          paymentStatus: 'PAID',
          shippingAddress: {},
        },
      });

      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          orderId,
          sellerId,
          amount: 300000n,
          status: 'CONFIRMED',
          shipmentStatus: 'SYNCED',
          settlementStatus: 'PENDING',
          awbCode: 'awb-e2e-999',
        },
      });

      await prisma.orderItem.create({
        data: {
          subOrderId,
          skuId,
          quantity: 2,
          price: 150000n,
          mrp: 200000n,
        },
      });

      // Complete reservation
      await prisma.inventoryReservation.create({
        data: {
          skuId,
          warehouseId: warehouse.id,
          userId: buyerId,
          orderId,
          reservationCode: 'res-999',
          quantity: 2,
          expiresAt: new Date(Date.now() + 60000),
          status: 'COMPLETED',
        },
      });

      // Force inventory decrement to simulate fulfillment deduction (onHand: 100 - 2 = 98)
      await prisma.skuInventory.update({
        where: { warehouseId_skuId: { warehouseId: warehouse.id, skuId } },
        data: { onHand: 98 },
      });

      // 2. Fire RTO Webhook
      await request(app.getHttpServer() as App)
        .post('/logistics/shiprocket-webhook')
        .set('x-api-key', webhookToken)
        .send({
          awb_code: 'awb-e2e-999',
          status: 'RTO',
        })
        .expect(201);

      // 3. Verify payout canceled, reservation RETURNED, stock restocked to 100, and ledger updated
      const subOrder = await prisma.subOrder.findUniqueOrThrow({
        where: { id: subOrderId },
      });
      expect(subOrder.settlementStatus).toBe('CANCELED');

      const inv = await prisma.skuInventory.findUniqueOrThrow({
        where: { warehouseId_skuId: { warehouseId: warehouse.id, skuId } },
      });
      expect(inv.onHand).toBe(100);

      const ledger = await prisma.inventoryLedger.findFirstOrThrow({
        where: { type: 'RETURN_RESTOCK', referenceId: subOrderId },
      });
      expect(ledger.quantityDelta).toBe(2);

      const res = await prisma.inventoryReservation.findFirstOrThrow({
        where: { reservationCode: 'res-999' },
      });
      expect(res.status).toBe('RETURNED');
    });

    it('should flag sub-order as CLAWBACK_REQUIRED and emit outbox alerts during post-settlement RTO events', async () => {
      const warehouse = await prisma.warehouse.findFirstOrThrow();

      // 1. Setup settled sub-order
      await prisma.order.create({
        data: {
          id: orderId,
          buyerId,
          gatewayOrderId: 'order_e2e_000',
          totalAmount: 300000n,
          paymentStatus: 'PAID',
          shippingAddress: {},
        },
      });

      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          orderId,
          sellerId,
          amount: 300000n,
          status: 'DELIVERED',
          shipmentStatus: 'SYNCED',
          settlementStatus: 'SETTLED', // Settlement already completed
          awbCode: 'awb-e2e-888',
        },
      });

      await prisma.orderItem.create({
        data: {
          subOrderId,
          skuId,
          quantity: 2,
          price: 150000n,
          mrp: 200000n,
        },
      });

      // Complete reservation
      await prisma.inventoryReservation.create({
        data: {
          skuId,
          warehouseId: warehouse.id,
          userId: buyerId,
          orderId,
          reservationCode: 'res-888',
          quantity: 2,
          expiresAt: new Date(Date.now() + 60000),
          status: 'COMPLETED',
        },
      });

      // Force inventory decrement to simulate fulfillment deduction (onHand: 100 - 2 = 98)
      await prisma.skuInventory.update({
        where: { warehouseId_skuId: { warehouseId: warehouse.id, skuId } },
        data: { onHand: 98 },
      });

      // 2. Fire RTO Webhook
      await request(app.getHttpServer() as App)
        .post('/logistics/shiprocket-webhook')
        .set('x-api-key', webhookToken)
        .send({
          awb_code: 'awb-e2e-888',
          status: 'RTO',
        })
        .expect(201);

      // 3. Verify status flagged, outbox alert written, stock restocked, and ledger updated
      const subOrder = await prisma.subOrder.findUniqueOrThrow({
        where: { id: subOrderId },
      });
      expect(subOrder.settlementStatus).toBe('CLAWBACK_REQUIRED');

      const alert = await prisma.outboxEvent.findFirstOrThrow({
        where: { eventType: 'payout.clawback_required' },
      });
      const parsedPayload = JSON.parse(alert.payload as string);
      expect(parsedPayload.subOrderId).toBe(subOrderId);
      expect(parsedPayload.amount).toBe('300000');

      const inv = await prisma.skuInventory.findUniqueOrThrow({
        where: { warehouseId_skuId: { warehouseId: warehouse.id, skuId } },
      });
      expect(inv.onHand).toBe(100);

      const ledger = await prisma.inventoryLedger.findFirstOrThrow({
        where: { type: 'RETURN_RESTOCK', referenceId: subOrderId },
      });
      expect(ledger.quantityDelta).toBe(2);

      const res = await prisma.inventoryReservation.findFirstOrThrow({
        where: { reservationCode: 'res-888' },
      });
      expect(res.status).toBe('RETURNED');
    });

    it('should reject seller dispatch attempt for sub-orders owned by another seller (403 Forbidden)', async () => {
      // Create seller 2 and seller 2 token
      const seller2Id = crypto.randomUUID();
      await prisma.user.create({
        data: {
          id: seller2Id,
          phone: `+91988${Math.floor(1000000 + Math.random() * 9000000)}`,
          roles: ['SELLER'],
        },
      });
      const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
      const seller2Token = await jwtService.signAsync(
        { sub: seller2Id, roles: ['SELLER'] },
        { secret, expiresIn: '15m' },
      );

      // Create order and sub-order owned by seller 1
      const orderId = crypto.randomUUID();
      const subOrderId = crypto.randomUUID();
      await prisma.order.create({
        data: {
          id: orderId,
          buyerId,
          gatewayOrderId: 'gateway-order-seller-ownership-test',
          totalAmount: 10000n,
          discountAmount: 0n,
          amountCharged: 10000n,
          paymentStatus: 'PAID',
          shippingAddress: { city: 'Delhi' },
        },
      });
      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          orderId,
          sellerId, // Owned by seller 1
          amount: 10000n,
          status: 'CONFIRMED',
          shipmentStatus: 'PENDING_SYNC',
        },
      });

      // Seller 2 attempts to dispatch Seller 1's sub-order -> 403 Forbidden
      await request(app.getHttpServer() as App)
        .post(`/logistics/seller/sub-orders/${subOrderId}/dispatch`)
        .set('Authorization', `Bearer ${seller2Token}`)
        .expect(403);
    });
  });

  afterAll(async () => {
    process.env.DISABLE_WORKERS = 'true';
    await app.close();
  });
});
