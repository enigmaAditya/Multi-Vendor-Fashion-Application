import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PayoutsService', () => {
  let service: PayoutsService;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
    },
    subOrder: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    payout: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    commissionRule: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    sellerLinkedAccount: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    commissionLedger: {
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
    jest.clearAllMocks();
  });

  describe('linkSellerAccount', () => {
    it('should upsert seller account details if user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'seller-1' });
      mockPrisma.sellerLinkedAccount.upsert.mockResolvedValue({
        sellerId: 'seller-1',
        gatewayAccountId: 'acc_123',
        status: 'ACTIVE',
      });

      const res = await service.linkSellerAccount('seller-1', 'acc_123');
      expect(res.status).toBe('ACTIVE');
    });

    it('should throw NotFoundException if seller does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.linkSellerAccount('seller-999', 'acc_123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('settlePayout Math & Precedence', () => {
    it('should compute commission per-item, round correctly, and reconcile to the paise', async () => {
      // Mock sub-order details
      mockPrisma.payout.findUnique.mockResolvedValue(null); // No existing payout (new flow)
      mockPrisma.subOrder.updateMany.mockResolvedValue({ count: 1 }); // Atomic claim succeeds

      mockPrisma.subOrder.findUnique.mockResolvedValue({
        id: 'sub-1',
        sellerId: 'seller-1',
        amount: BigInt(10050), // Sub-order total: 10050 Paise (Rs 100.50)
        items: [
          {
            id: 'item-1',
            price: BigInt(3350),
            quantity: 1,
            sku: { variant: { productId: 'prod-1' } },
          },
          {
            id: 'item-2',
            price: BigInt(6700),
            quantity: 1,
            sku: { variant: { productId: 'prod-2' } },
          },
        ],
      });

      // Commission rules:
      // Seller rule is absent.
      mockPrisma.commissionRule.findUnique.mockImplementation((args: any) => {
        if (args.where.sellerId === 'seller-1') return Promise.resolve(null);
        // Category rule: prod-1 category has 6% rate
        if (args.where.categoryId === 'cat-1') {
          return Promise.resolve({ ratePercent: 6.0 });
        }
        // Default 5% rate for prod-2 category (missing rule)
        return Promise.resolve(null);
      });

      mockPrisma.product.findUnique.mockImplementation((args: any) => {
        if (args.where.id === 'prod-1')
          return Promise.resolve({ categoryId: 'cat-1' });
        return Promise.resolve({ categoryId: 'cat-2' });
      });

      // Seller payout account is ACTIVE
      mockPrisma.sellerLinkedAccount.findUnique.mockResolvedValue({
        gatewayAccountId: 'acc_active_123',
        status: 'ACTIVE',
      });

      // Mock Payout pre-creation
      mockPrisma.payout.create.mockResolvedValue({
        id: 'payout-123',
        status: 'PENDING',
        retryCount: 0,
      });

      // Mock Fetch (Razorpay Route)
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'trf_gw_123' }),
      });
      global.fetch = mockFetch;

      // Mock Payout atomic SUCCESS commit
      mockPrisma.payout.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.settlePayout('sub-1');
      expect(res.success).toBe(true);

      // Verify commission math:
      // Item 1: 3350 * 0.06 = 201 paise commission
      // Item 2: 6700 * 0.05 = 335 paise commission
      // Total commission = 201 + 335 = 536 paise
      // Net payout = 10050 - 536 = 9514 paise
      // Verification check: 9514 + 536 = 10050 paise (reconciles perfectly!)
      expect(mockPrisma.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: BigInt(9514),
          }),
        }),
      );
    });
  });
});
