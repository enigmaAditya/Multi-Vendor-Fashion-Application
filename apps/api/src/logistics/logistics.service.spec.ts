import { Test, TestingModule } from '@nestjs/testing';
import { LogisticsService } from './logistics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PayoutsService } from '../payouts/payouts.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('LogisticsService', () => {
  let service: LogisticsService;
  let moduleRef: TestingModule;

  const mockPrisma: any = {
    subOrder: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    inventoryReservation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    skuInventory: {
      update: jest.fn(),
    },
    inventoryLedger: {
      create: jest.fn(),
    },
    shipmentWebhookLog: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockRedisService = {
    getClient: () => mockRedisClient,
  };

  const mockPayoutsService = {
    processDelivery: jest.fn(),
    cancelPayout: jest.fn(),
  };

  beforeEach(async () => {
    process.env.SHIPROCKET_WEBHOOK_TOKEN = 'test_webhook_token';
    moduleRef = await Test.createTestingModule({
      providers: [
        LogisticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
        { provide: PayoutsService, useValue: mockPayoutsService },
      ],
    }).compile();

    service = moduleRef.get<LogisticsService>(LogisticsService);
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('getShiprocketToken', () => {
    it('should return cached token if available in Redis', async () => {
      mockRedisClient.get.mockResolvedValue('cached_token_xyz');

      const token = await service.getShiprocketToken();
      expect(token).toBe('cached_token_xyz');
      expect(mockRedisClient.get).toHaveBeenCalledWith('shiprocket_token');
    });

    it('should acquire lock, fetch from API, cache, and return new token', async () => {
      mockRedisClient.get.mockResolvedValue(null); // cache miss
      mockRedisClient.set.mockResolvedValue('OK'); // acquired lock

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'new_token_123' }),
      } as unknown as Response);

      const token = await service.getShiprocketToken();
      expect(token).toBe('new_token_123');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'shiprocket_token_lock',
        'locked',
        'EX',
        5,
        'NX',
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'shiprocket_token',
        'new_token_123',
        'EX',
        23 * 60 * 60,
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith('shiprocket_token_lock');
      fetchSpy.mockRestore();
    });
  });

  describe('syncShipment', () => {
    it('should skip syncing if status claim count is 0 (already synced or syncing)', async () => {
      mockPrisma.subOrder.updateMany.mockResolvedValue({ count: 0 });

      const res = await service.syncShipment('sub-order-1');
      expect(res.success).toBe(false);
      expect(res.message).toBe('Sync already processed or in-flight.');
    });

    it('should construct order details, post to Shiprocket API, and update sub-order on success', async () => {
      mockPrisma.subOrder.updateMany.mockResolvedValue({ count: 1 });
      mockRedisClient.get.mockResolvedValue('token_xyz');

      mockPrisma.subOrder.findUnique.mockResolvedValue({
        id: 'sub-order-1',
        orderId: 'order-1',
        amount: 5000n, // 50.00 rupees
        order: {
          shippingAddress: {
            name: 'Jane Doe',
            address: '123 Main St',
            city: 'New Delhi',
            pincode: '110001',
            state: 'Delhi',
            phone: '+919999999999',
          },
        },
        items: [
          {
            quantity: 2,
            price: 2500n,
            sku: {
              id: 'sku-1',
              variant: {
                product: {
                  name: 'Designer T-Shirt',
                },
              },
            },
          },
        ],
      });

      mockPrisma.inventoryReservation.findFirst.mockResolvedValue({
        warehouse: {
          code: 'DELHI-WH',
        },
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            shipment_id: 'ship-999',
            awb_code: 'awb-888',
            courier_name: 'Delhivery',
          }),
      } as unknown as Response);

      const res = await service.syncShipment('sub-order-1');
      expect(res.success).toBe(true);
      expect(res.shipmentId).toBe('ship-999');
      expect(res.awbCode).toBe('awb-888');

      expect(mockPrisma.subOrder.update).toHaveBeenCalledWith({
        where: { id: 'sub-order-1' },
        data: {
          shipmentStatus: 'SYNCED',
          shipmentId: 'ship-999',
          awbCode: 'awb-888',
          courierName: 'Delhivery',
        },
      });
      fetchSpy.mockRestore();
    });
  });

  describe('handleWebhook', () => {
    it('should throw ForbiddenException on invalid webhook signature', async () => {
      await expect(
        service.handleWebhook('invalid_sig', {
          awb_code: 'awb-1',
          status: 'delivered',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should insert webhook logs and trigger processDelivery on DELIVERED status', async () => {
      mockPrisma.subOrder.findFirst.mockResolvedValue({
        id: 'sub-order-1',
        amount: 5000n,
        items: [],
      });

      mockPrisma.shipmentWebhookLog.create.mockResolvedValue({ id: 'log-1' });

      const res = await service.handleWebhook('test_webhook_token', {
        awb_code: 'awb-123',
        status: 'DELIVERED',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.shipmentWebhookLog.create).toHaveBeenCalled();
      expect(mockPayoutsService.processDelivery).toHaveBeenCalledWith(
        'sub-order-1',
        604800,
        expect.anything(),
      );
    });

    it('should trigger cancelPayout on RETURNED status, and handle clawback if already settled', async () => {
      mockPrisma.subOrder.findFirst.mockResolvedValue({
        id: 'sub-order-1',
        amount: 5000n,
        items: [],
      });
      mockPrisma.shipmentWebhookLog.create.mockResolvedValue({ id: 'log-1' });
      mockPayoutsService.cancelPayout.mockRejectedValue(
        new BadRequestException('Payout already settling or completed.'),
      );

      const res = await service.handleWebhook('test_webhook_token', {
        awb_code: 'awb-123',
        status: 'RETURNED',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.subOrder.update).toHaveBeenCalledWith({
        where: { id: 'sub-order-1' },
        data: { settlementStatus: 'CLAWBACK_REQUIRED' },
      });
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });
  });
});
