import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CouponsService } from '../coupons/coupons.service';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('OrdersService', () => {
  let service: OrdersService;

  const mockPrisma: any = {
    sku: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    skuInventory: {
      findMany: jest.fn(),
    },
    warehouse: {
      findFirst: jest.fn(),
    },
    paymentWebhookLog: {
      create: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subOrder: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    orderItem: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockInventoryService: any = {
    reserveStock: jest.fn(),
    commitReservation: jest.fn(),
    releaseReservation: jest.fn(),
  };

  const mockCouponsService: any = {
    validateAndCalculateDiscount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: CouponsService, useValue: mockCouponsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  describe('initializeCheckout', () => {
    it('should recompute cart amount using DB pricing and ignore client tampering', async () => {
      mockPrisma.sku.findMany.mockResolvedValue([
        {
          id: 'sku-1',
          price: BigInt(2000), // Server price: 2000
          mrp: BigInt(3000),
          sellerId: 'seller-1',
          variant: { product: { name: 'Shirt', status: 'LIVE' } },
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'seller-1' });
      mockPrisma.skuInventory.findMany.mockResolvedValue([
        { warehouseId: 'wh-1', onHand: 10 },
      ]);

      // Mock native fetch
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'order_gw_123' }),
      });
      global.fetch = mockFetch;

      mockPrisma.order.create.mockResolvedValue({
        id: 'ord-123',
        totalAmount: BigInt(4000),
      });
      mockPrisma.subOrder.create.mockResolvedValue({
        id: 'sub-ord-123',
      });

      const cartItems = [{ skuId: 'sku-1', quantity: 2 }];
      const res = await service.initializeCheckout('buyer-1', cartItems, {
        line1: 'street',
      });

      expect(res.gatewayOrderId).toBe('order_gw_123');
      expect(mockInventoryService.reserveStock).toHaveBeenCalledWith(
        'buyer-1',
        'sku-1',
        'wh-1',
        2,
        expect.any(String),
        900,
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.razorpay.com/v1/orders',
        expect.objectContaining({
          body: expect.stringContaining('"amount":4000'),
        }),
      );
    });

    it('should block checkout of drafts or non-LIVE products', async () => {
      mockPrisma.sku.findMany.mockResolvedValue([
        {
          id: 'sku-1',
          price: BigInt(2000),
          mrp: BigInt(3000),
          sellerId: 'seller-1',
          variant: { product: { name: 'Shirt', status: 'DRAFT' } }, // DRAFT
        },
      ]);

      const cartItems = [{ skuId: 'sku-1', quantity: 1 }];
      await expect(
        service.initializeCheckout('buyer-1', cartItems, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handlePaymentWebhook', () => {
    const mockSecret = 'webhooksecret';

    beforeAll(() => {
      process.env.RAZORPAY_WEBHOOK_SECRET = mockSecret;
    });

    it('should throw BadRequestException on signature mismatch', async () => {
      const invalidSignature = 'invalid_sig';
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'payment.captured' }),
      );

      await expect(
        service.handlePaymentWebhook(rawBody, invalidSignature, 'evt-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 200 OK duplicate status if event is duplicate (idempotency)', async () => {
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'payment.captured' }),
      );
      const shasum = crypto.createHmac('sha256', mockSecret);
      shasum.update(rawBody);
      const signature = shasum.digest('hex');

      // Force mockPrisma.paymentWebhookLog.create to throw (Duplicate Key)
      mockPrisma.paymentWebhookLog.create.mockRejectedValueOnce(
        new Error('P2002'),
      );

      const res = await service.handlePaymentWebhook(
        rawBody,
        signature,
        'evt-123',
      );

      expect(res).toEqual({ success: true, message: 'Duplicate event' });
    });
  });
});
