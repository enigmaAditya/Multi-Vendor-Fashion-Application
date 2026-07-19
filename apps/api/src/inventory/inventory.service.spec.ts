import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('InventoryService', () => {
  let service: InventoryService;

  const mockPrisma: any = {
    warehouse: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    sku: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    skuInventory: {
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    inventoryReservation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    inventoryLedger: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
    $executeRaw: jest.fn(),
  };

  const mockQueue: any = {
    add: jest.fn(),
    close: jest.fn(),
  };

  let moduleRef: TestingModule;
  let originalQueue: any;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = moduleRef.get<InventoryService>(InventoryService);
    originalQueue = (service as any).inventoryQueue;
    // Overwrite programmatic queue with mock
    (service as any).inventoryQueue = mockQueue;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (originalQueue) {
      await originalQueue.close();
    }
    await moduleRef.close();
  });

  describe('addStock', () => {
    it('should add stock successfully and log to ledger', async () => {
      mockPrisma.sku.findUnique.mockResolvedValue({
        id: 'sku-1',
        sellerId: 'seller-1',
      });
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh-1' });
      mockPrisma.skuInventory.upsert.mockResolvedValue({
        id: 'inv-1',
        skuId: 'sku-1',
        warehouseId: 'wh-1',
        onHand: 10,
        reserved: 0,
      });

      const res = await service.addStock(
        'seller-1',
        'sku-1',
        'wh-1',
        10,
        'replenish',
      );

      expect(res).toBeDefined();
      expect(mockPrisma.skuInventory.upsert).toHaveBeenCalled();
      expect(mockPrisma.inventoryLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'STOCK_IN',
            quantityDelta: 10,
          }),
        }),
      );
    });

    it('should block if seller does not own SKU', async () => {
      mockPrisma.sku.findUnique.mockResolvedValue({
        id: 'sku-1',
        sellerId: 'other-seller',
      });

      await expect(
        service.addStock('seller-1', 'sku-1', 'wh-1', 10),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reserveStock', () => {
    it('should atomically reserve stock and schedule TTL task', async () => {
      mockPrisma.sku.findUnique.mockResolvedValue({ id: 'sku-1' });
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh-1' });
      mockPrisma.inventoryReservation.findFirst.mockResolvedValue(null);
      mockPrisma.$executeRaw.mockResolvedValue(1); // Row claimed
      mockPrisma.inventoryReservation.create.mockResolvedValue({
        id: 'res-1',
        skuId: 'sku-1',
        warehouseId: 'wh-1',
        quantity: 2,
        reservationCode: 'CODE123',
      });

      const res = await service.reserveStock(
        'user-1',
        'sku-1',
        'wh-1',
        2,
        'CODE123',
        60,
      );

      expect(res).toBeDefined();
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-expiry',
        { reservationCode: 'CODE123' },
        { delay: 60000 },
      );
      expect(mockPrisma.inventoryLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RESERVATION_HOLD',
            reservedDelta: 2,
          }),
        }),
      );
    });

    it('should throw BadRequestException if stock is insufficient', async () => {
      mockPrisma.sku.findUnique.mockResolvedValue({ id: 'sku-1' });
      mockPrisma.warehouse.findUnique.mockResolvedValue({ id: 'wh-1' });
      mockPrisma.inventoryReservation.findFirst.mockResolvedValue(null);
      mockPrisma.$executeRaw.mockResolvedValue(0); // 0 rows affected

      await expect(
        service.reserveStock('user-1', 'sku-1', 'wh-1', 5, 'CODE999'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('releaseReservation', () => {
    it('should atomically flip status and restore reserved stock', async () => {
      mockPrisma.inventoryReservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          skuId: 'sku-1',
          warehouseId: 'wh-1',
          userId: 'user-1',
          quantity: 3,
          status: 'PENDING',
        },
      ]);
      mockPrisma.inventoryReservation.updateMany.mockResolvedValue({
        count: 1,
      });

      const res = await service.releaseReservation('user-1', 'CODE123');

      expect(res.success).toBe(true);
      expect(mockPrisma.skuInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reserved: { decrement: 3 } },
        }),
      );
      expect(mockPrisma.inventoryLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RESERVATION_RELEASE',
            reservedDelta: -3,
          }),
        }),
      );
    });
  });

  describe('commitReservation', () => {
    it('should commit successfully and decrement both onHand and reserved stock', async () => {
      mockPrisma.inventoryReservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          skuId: 'sku-1',
          warehouseId: 'wh-1',
          userId: 'user-1',
          quantity: 5,
          status: 'PENDING',
        },
      ]);
      mockPrisma.inventoryReservation.updateMany.mockResolvedValue({
        count: 1,
      });

      const res = await service.commitReservation('CODE123', 'order-1');

      expect(res.success).toBe(true);
      expect(mockPrisma.skuInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            onHand: { decrement: 5 },
            reserved: { decrement: 5 },
          },
        }),
      );
      expect(mockPrisma.inventoryLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RESERVATION_FULFILL',
            quantityDelta: -5,
            reservedDelta: -5,
          }),
        }),
      );
    });

    it('should throw BadRequestException if reservation lost the status race', async () => {
      mockPrisma.inventoryReservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          skuId: 'sku-1',
          warehouseId: 'wh-1',
          userId: 'user-1',
          quantity: 5,
          status: 'PENDING',
        },
      ]);
      mockPrisma.inventoryReservation.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.commitReservation('CODE123', 'order-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
