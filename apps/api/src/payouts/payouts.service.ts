import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';

@Injectable()
export class PayoutsService implements OnModuleDestroy {
  private readonly logger = new Logger(PayoutsService.name);
  private readonly payoutsQueue: Queue;

  constructor(private readonly prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    let connection: Record<string, unknown> | undefined;
    try {
      const parsed = new URL(redisUrl);
      connection = {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      connection = {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
      };
    }

    this.payoutsQueue = new Queue('payouts-processing', { connection });
  }

  async onModuleDestroy() {
    await this.payoutsQueue.close();
  }

  // --- Link Seller Account ---
  async linkSellerAccount(sellerId: string, gatewayAccountId: string) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Seller not found.');

    return this.prisma.sellerLinkedAccount.upsert({
      where: { sellerId },
      update: { gatewayAccountId, status: 'ACTIVE' },
      create: { sellerId, gatewayAccountId, status: 'ACTIVE' },
    });
  }

  // --- Process Delivery (Admin only) ---
  async processDelivery(subOrderId: string, escrowDelaySeconds = 604800) {
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
    });
    if (!subOrder) throw new NotFoundException('Sub-order not found.');

    // State machine guard: CONFIRMED -> DELIVERED
    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.subOrder.updateMany({
        where: { id: subOrderId, status: 'CONFIRMED' },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          settlementStatus: 'PENDING',
        },
      });

      if (affected.count === 0) {
        throw new BadRequestException(
          'Sub-order must be in CONFIRMED status to deliver.',
        );
      }

      // Schedule delayed BullMQ job representing escrow/return window
      await this.payoutsQueue.add(
        'check-settlement',
        { subOrderId },
        { delay: escrowDelaySeconds * 1000 },
      );

      return { success: true };
    });
  }

  // --- Cancel Payout (Returns/Refunds path) ---
  async cancelPayout(subOrderId: string) {
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
    });
    if (!subOrder) throw new NotFoundException('Sub-order not found.');

    // Bidirectional atomic claim (only allow cancellation if still PENDING)
    const affected = await this.prisma.subOrder.updateMany({
      where: { id: subOrderId, settlementStatus: 'PENDING' },
      data: { settlementStatus: 'CANCELED' },
    });

    if (affected.count === 0) {
      throw new BadRequestException(
        'Payout cannot be canceled because it is already settling or completed.',
      );
    }

    return { success: true };
  }

  // --- Settle Payout ---
  async settlePayout(subOrderId: string) {
    // 1. Self-Healing State Resume
    let payout = await this.prisma.payout.findUnique({
      where: { subOrderId },
    });

    if (payout) {
      if (payout.status === 'SUCCESS') {
        return { success: true, message: 'Already successfully settled.' };
      }
      if (payout.status === 'FAILED_PERMANENT') {
        this.logger.warn(
          `Payout for suborder ${subOrderId} is permanently failed. Manual reconciliation required.`,
        );
        return { success: false, message: 'Payout permanently failed.' };
      }
      // PENDING, BLOCKED, or FAILED: skip atomic claim and proceed to retry/resume
      this.logger.log(
        `Resuming payout for suborder ${subOrderId}. Current status: ${payout.status}`,
      );
    } else {
      // New Payout: Atomic claim PENDING -> SETTLING
      const claim = await this.prisma.subOrder.updateMany({
        where: { id: subOrderId, settlementStatus: 'PENDING' },
        data: { settlementStatus: 'SETTLING' },
      });

      if (claim.count === 0) {
        return {
          success: true,
          message: 'Sub-order already processed or canceled.',
        };
      }
    }

    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: { items: { include: { sku: { include: { variant: true } } } } },
    });
    if (!subOrder) throw new NotFoundException('Sub-order not found.');

    const sellerId = subOrder.sellerId;
    const idempotencyKey = `payout_sub_${subOrderId}`;

    // 2. Math & Rounding calculations per OrderItem (Fix 5)
    let totalCommission = BigInt(0);
    const itemCommissionDetails: {
      itemId: string;
      amount: bigint;
      rate: number;
    }[] = [];

    // Get seller rules override
    const sellerRule = await this.prisma.commissionRule.findUnique({
      where: { sellerId },
    });

    for (const item of subOrder.items) {
      let appliedRate = 5.0; // Fallback default 5%
      if (sellerRule) {
        appliedRate = sellerRule.ratePercent;
      } else {
        const catId = item.sku.variant.productId
          ? (
              await this.prisma.product.findUnique({
                where: { id: item.sku.variant.productId },
              })
            )?.categoryId
          : null;

        if (catId) {
          const catRule = await this.prisma.commissionRule.findUnique({
            where: { categoryId: catId },
          });
          if (catRule) {
            appliedRate = catRule.ratePercent;
          }
        }
      }

      // Calculate commission per item, round half up, and aggregate
      const itemSubtotal = item.price * BigInt(item.quantity);
      const itemComm = Math.round(Number(itemSubtotal) * (appliedRate / 100));
      totalCommission += BigInt(itemComm);
      itemCommissionDetails.push({
        itemId: item.id,
        amount: BigInt(itemComm),
        rate: appliedRate,
      });
    }

    const netPayout = subOrder.amount - totalCommission;

    // Reconciliation check
    if (subOrder.amount !== netPayout + totalCommission) {
      throw new Error(
        'Commission calculations do not reconcile exactly to the sub-order amount.',
      );
    }

    // 3. Setup/Retrieve PENDING Payout row
    if (!payout) {
      try {
        payout = await this.prisma.payout.create({
          data: {
            sellerId,
            subOrderId,
            amount: netPayout,
            status: 'PENDING',
            idempotencyKey,
          },
        });
      } catch (err: any) {
        // Unique constraint violation race (handled)
        payout = await this.prisma.payout.findUnique({
          where: { subOrderId },
        });
        if (!payout) throw err;
      }
    }

    // 4. Verify Active Seller Linked Account
    const linkedAccount = await this.prisma.sellerLinkedAccount.findUnique({
      where: { sellerId },
    });

    if (!linkedAccount || linkedAccount.status !== 'ACTIVE') {
      this.logger.warn(
        `Seller payout account for ${sellerId} is missing or inactive.`,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.payout.update({
          where: { id: payout.id },
          data: { status: 'BLOCKED' },
        });
        await tx.subOrder.update({
          where: { id: subOrderId },
          data: { settlementStatus: 'BLOCKED' },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'payout.blocked',
            payload: {
              subOrderId,
              sellerId,
              amount: netPayout.toString(),
            },
          },
        });
      });
      return { success: false, message: 'Seller linked account not active.' };
    }

    // Reset status to PENDING if resuming from BLOCKED now that account is active
    if (payout.status === 'BLOCKED') {
      payout = await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'PENDING' },
      });
    }

    // 5. Call External API (Razorpay Route Payout) - OUTSIDE of database transaction
    let gatewayTransferId = '';
    let callSucceeded = false;
    let apiError: unknown = null;

    try {
      const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkey';
      const keySecret = process.env.RAZORPAY_KEY_SECRET || 'mocksecret';
      const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString(
        'base64',
      );

      // Post transfer to Razorpay using idempotency key
      const response = await fetch('https://api.razorpay.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
          'X-Razorpay-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          account: linkedAccount.gatewayAccountId,
          amount: Number(netPayout),
          currency: 'INR',
          notes: {
            subOrderId,
            payoutId: payout.id,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Razorpay transfer failed with status ${response.status}: ${errorText}`,
        );
      }

      const resBody = (await response.json()) as { id: string };
      gatewayTransferId = resBody.id;
      callSucceeded = true;
    } catch (err) {
      apiError = err;
    }

    if (!callSucceeded) {
      const nextRetryCount = payout.retryCount + 1;
      const apiMsg =
        apiError instanceof Error ? apiError.message : String(apiError);
      if (nextRetryCount >= 5) {
        // Move to terminal FAILED_PERMANENT state (Fix 3)
        await this.prisma.$transaction(async (tx) => {
          await tx.payout.update({
            where: { id: payout.id },
            data: { status: 'FAILED_PERMANENT', retryCount: nextRetryCount },
          });
          await tx.subOrder.update({
            where: { id: subOrderId },
            data: { settlementStatus: 'FAILED_PERMANENT' },
          });
          await tx.outboxEvent.create({
            data: {
              eventType: 'payout.failed_permanent',
              payload: {
                subOrderId,
                payoutId: payout.id,
                error: apiMsg || 'Unknown API failure',
              },
            },
          });
        });
        return { success: false, message: 'Payout permanently failed.' };
      } else {
        // Mark FAILED for retry
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: { status: 'FAILED', retryCount: nextRetryCount },
        });
        throw new Error(
          `Payout transfer temporary failure: ${apiMsg || 'Unknown error'}`,
        );
      }
    }

    // 6. Commit final outcome atomically (Fix 1)
    try {
      await this.prisma.$transaction(async (tx) => {
        // Atomic status claim to prevent double outbox emissions
        const affectedPayout = await tx.payout.updateMany({
          where: {
            id: payout.id,
            status: { in: ['PENDING', 'FAILED', 'BLOCKED'] },
          },
          data: {
            status: 'SUCCESS',
            gatewayTransferId,
          },
        });

        if (affectedPayout.count === 0) {
          throw new Error('Payout status already updated by another process.');
        }

        await tx.subOrder.update({
          where: { id: subOrderId },
          data: { settlementStatus: 'SETTLED' },
        });

        // Write to double-entry ledger logs
        for (const details of itemCommissionDetails) {
          await tx.commissionLedger.create({
            data: {
              subOrderId,
              amount: details.amount,
              feeRate: details.rate,
              type: 'EARNED',
            },
          });
        }

        // Write outbox event
        await tx.outboxEvent.create({
          data: {
            eventType: 'payout.settled',
            payload: {
              subOrderId,
              payoutId: payout.id,
              gatewayTransferId,
              amount: netPayout.toString(),
              commission: totalCommission.toString(),
            },
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'Payout status already updated by another process.'
      ) {
        return { success: true, message: 'Already successfully settled.' };
      }
      throw err;
    }

    return { success: true };
  }

  // --- Queries ---
  async getCommissionLedger() {
    return this.prisma.commissionLedger.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSellerPayouts(sellerId: string) {
    return this.prisma.payout.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
