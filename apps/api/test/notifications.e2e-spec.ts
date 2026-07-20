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
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationsProcessor } from '../src/notifications/notifications.processor';

describe('Notifications System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  let notificationsService: NotificationsService;
  let notificationsProcessor: NotificationsProcessor;

  let buyerToken: string;
  let buyerId: string;
  let sellerId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    authService = app.get<AuthService>(AuthService);
    notificationsService = app.get<NotificationsService>(NotificationsService);
    notificationsProcessor = app.get<NotificationsProcessor>(
      NotificationsProcessor,
    );

    // Clean up test data
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
    await prisma.user.deleteMany();

    // 1. Create Buyer user and generate token
    buyerId = crypto.randomUUID();
    const buyer = await prisma.user.create({
      data: { id: buyerId, phone: '+919988776655', roles: ['BUYER'] },
    });
    const tokens = await authService.issueTokens(buyer);
    buyerToken = tokens.accessToken;

    // 2. Create Seller user
    sellerId = crypto.randomUUID();
    await prisma.user.create({
      data: { id: sellerId, phone: '+919988776644', roles: ['SELLER'] },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Device Tokens REST Endpoints', () => {
    it('should register a new FCM device token', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/device-tokens')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ token: 'fcm_web_token_123', platform: 'WEB' })
        .expect(201);

      expect(res.body.token).toBe('fcm_web_token_123');

      const tokenInDb = await prisma.userDeviceToken.findUnique({
        where: { token: 'fcm_web_token_123' },
      });
      expect(tokenInDb).toBeDefined();
      expect(tokenInDb?.userId).toBe(buyerId);
    });

    it('should delete registered device token on logout', async () => {
      await prisma.userDeviceToken.create({
        data: { userId: buyerId, token: 'delete_me_token', platform: 'WEB' },
      });

      await request(app.getHttpServer())
        .delete('/notifications/device-tokens/delete_me_token')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(204);

      const deleted = await prisma.userDeviceToken.findUnique({
        where: { token: 'delete_me_token' },
      });
      expect(deleted).toBeNull();
    });
  });

  describe('User Preferences REST Endpoints', () => {
    it('should fetch and update user notification preferences', async () => {
      const getRes = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(getRes.body.emailEnabled).toBe(true);
      expect(getRes.body.pushEnabled).toBe(true);

      const patchRes = await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ pushEnabled: false })
        .expect(200);

      expect(patchRes.body.pushEnabled).toBe(false);
      expect(patchRes.body.emailEnabled).toBe(true);
    });
  });

  describe('Logistics Outbox Emission & Dedup Gate Integration', () => {
    it('should emit shipment.dispatched outbox event on Logistics webhook and enforce atomic dedup gate', async () => {
      // 1. Create order & sub-order for buyer and seller
      const order = await prisma.order.create({
        data: {
          buyerId,
          gatewayOrderId: 'order_gw_notif_123',
          totalAmount: BigInt(10000),
          amountCharged: BigInt(10000),
          shippingAddress: { city: 'Mumbai' },
          paymentStatus: 'PAID',
        },
      });

      const subOrder = await prisma.subOrder.create({
        data: {
          orderId: order.id,
          sellerId,
          amount: BigInt(10000),
          status: 'CONFIRMED',
          shipmentStatus: 'SYNCED',
          awbCode: 'AWB_NOTIF_123',
          courierName: 'Delhivery',
        },
      });

      // Register device token for buyer
      await prisma.userDeviceToken.create({
        data: {
          userId: buyerId,
          token: 'valid_buyer_push_token',
          platform: 'WEB',
        },
      });

      // 2. Trigger Shiprocket DISPATCHED webhook
      const webhookToken =
        process.env.SHIPROCKET_WEBHOOK_TOKEN || 'test_webhook_token';
      await request(app.getHttpServer())
        .post('/logistics/shiprocket-webhook')
        .set('x-api-key', webhookToken)
        .send({
          awb_code: 'AWB_NOTIF_123',
          status: 'DISPATCHED',
          courier_name: 'Delhivery',
        })
        .expect(201);

      // 3. Verify outbox event shipment.dispatched was emitted inside transaction
      const outboxEvent = await prisma.outboxEvent.findFirst({
        where: { eventType: 'shipment.dispatched' },
      });
      expect(outboxEvent).toBeDefined();

      // 4. Process outbox events (fan-out into BullMQ notifications-queue)
      await notificationsProcessor.processOutboxNotificationEvents();

      // 5. Test atomic dedup gate: deliver the job twice for buyer EMAIL channel
      const jobData = {
        outboxEventId: outboxEvent!.id,
        eventType: 'shipment.dispatched',
        channel: 'EMAIL' as const,
        recipientId: buyerId,
        recipientRole: 'BUYER' as const,
        payload: {
          subOrderId: subOrder.id,
          awbCode: 'AWB_NOTIF_123',
          courierName: 'Delhivery',
        },
      };

      const firstDelivery =
        await notificationsService.deliverNotificationJob(jobData);
      expect(firstDelivery.success).toBe(true);

      const secondDelivery =
        await notificationsService.deliverNotificationJob(jobData);
      expect(secondDelivery.skipped).toBe(true);

      // Verify NotificationLog table has exactly 1 entry for this (outboxEventId, channel, recipientId)
      const logs = await prisma.notificationLog.findMany({
        where: {
          outboxEventId: outboxEvent!.id,
          channel: 'EMAIL',
          recipientId: buyerId,
        },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('SENT');
    });
  });
});
