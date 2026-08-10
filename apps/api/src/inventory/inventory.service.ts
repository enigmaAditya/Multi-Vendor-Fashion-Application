import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

@Injectable()
export class InventoryService implements OnModuleDestroy {
  private readonly logger = new Logger(InventoryService.name);
  private readonly inventoryQueue: Queue;

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

    this.inventoryQueue = new Queue('inventory-processing', { connection });
    this.inventoryQueue.on('error', (err) => {
      this.logger.error(`Inventory queue error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    await this.inventoryQueue.close();
  }

  // --- Warehouse ---
  async createWarehouse(name: string, code: string, address?: string) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { OR: [{ name }, { code }] },
    });
    if (existing) {
      throw new BadRequestException(
        'Warehouse with this name or code already exists.',
      );
    }
    return this.prisma.warehouse.create({
      data: { name, code, address },
    });
  }

  async getWarehouses() {
    return this.prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // --- Stock Addition (Double-entry / Incremental) ---
  async addStock(
    sellerId: string,
    skuId: string,
    warehouseId: string,
    qty: number,
    reason?: string,
  ) {
    if (qty <= 0) {
      throw new BadRequestException(
        'Quantity delta must be greater than zero.',
      );
    }

    // 1. Validate SKU exists and is owned by the seller
    const sku = await this.prisma.sku.findUnique({
      where: { id: skuId },
    });
    if (!sku) {
      throw new NotFoundException('SKU not found.');
    }
    if (sku.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this SKU.');
    }

    // 2. Validate warehouse exists
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found.');
    }

    // 3. Atomically upsert inventory and log to ledger inside transaction
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return this.wrapAvailabilityFlip(tx, [skuId], async () => {
        const inventory = await tx.skuInventory.upsert({
          where: {
            warehouseId_skuId: { warehouseId, skuId },
          },
          update: {
            onHand: { increment: qty },
          },
          create: {
            skuId,
            warehouseId,
            onHand: qty,
            reserved: 0,
          },
        });

        await tx.inventoryLedger.create({
          data: {
            skuId,
            warehouseId,
            quantityDelta: qty,
            reservedDelta: 0,
            type: 'STOCK_IN',
            reason: reason || 'Initial stock replenishment',
          },
        });

        return inventory;
      });
    });
  }

  async getStockLevel(skuId: string) {
    const inventories = await this.prisma.skuInventory.findMany({
      where: { skuId },
      include: { warehouse: true },
    });
    return inventories;
  }

  // --- Atomic Reservation ---
  async reserveStock(
    userId: string,
    skuId: string,
    warehouseId: string,
    quantity: number,
    reservationCode: string,
    ttlSeconds = 900, // 15 mins default
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    if (quantity <= 0) {
      throw new BadRequestException('Reservation quantity must be positive.');
    }

    // Check SKU and Warehouse exist
    const sku = await client.sku.findUnique({ where: { id: skuId } });
    if (!sku) throw new NotFoundException('SKU not found.');

    const warehouse = await client.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found.');

    // Enforce unique reservation code per SKU to prevent double claims
    const existingRes = await client.inventoryReservation.findFirst({
      where: { reservationCode, skuId },
    });
    if (existingRes) {
      throw new BadRequestException('Reservation code already used.');
    }

    const runOperations = async (runner: Prisma.TransactionClient) => {
      return this.wrapAvailabilityFlip(runner, [skuId], async () => {
        // 1. Double check SkuInventory row exists, if not initialize it (with 0 onHand)
        await runner.skuInventory.upsert({
          where: {
            warehouseId_skuId: { warehouseId, skuId },
          },
          update: {},
          create: {
            skuId,
            warehouseId,
            onHand: 0,
            reserved: 0,
          },
        });

        // 2. Perform atomic row lock update claim using correctly double-quoted PostgreSQL camelCase fields
        const affected = await runner.$executeRaw`
          UPDATE sku_inventories
          SET "reserved" = "reserved" + ${quantity}
          WHERE "skuId" = ${skuId}
            AND "warehouseId" = ${warehouseId}
            AND ("onHand" - "reserved") >= ${quantity}
        `;

        if (affected === 0) {
          throw new BadRequestException('Insufficient stock available.');
        }

        // 3. Save reservation record
        const reservation = await runner.inventoryReservation.create({
          data: {
            skuId,
            warehouseId,
            userId,
            reservationCode,
            quantity,
            expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            status: 'PENDING',
          },
        });

        // 4. Log to append-only ledger
        await runner.inventoryLedger.create({
          data: {
            skuId,
            warehouseId,
            quantityDelta: 0,
            reservedDelta: quantity,
            type: 'RESERVATION_HOLD',
            referenceId: reservation.id,
          },
        });

        // 5. Schedule BullMQ delayed task for TTL expiry checks
        await this.inventoryQueue.add(
          'check-expiry',
          { reservationCode },
          { delay: ttlSeconds * 1000 },
        );

        return reservation;
      });
    };

    if (tx) {
      return runOperations(tx);
    } else {
      return this.prisma.$transaction(runOperations);
    }
  }

  // --- Release Reservation ---
  async releaseReservation(
    userId: string,
    reservationCode: string,
    isAdmin = false,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    const reservations = await client.inventoryReservation.findMany({
      where: { reservationCode },
    });

    if (reservations.length === 0) {
      throw new NotFoundException('Reservation code not found.');
    }

    // Verify ownership
    if (!isAdmin) {
      for (const res of reservations) {
        if (res.userId !== userId) {
          throw new ForbiddenException('You do not own this reservation.');
        }
      }
    }

    const pendingReservations = reservations.filter(
      (r) => r.status === 'PENDING',
    );
    if (pendingReservations.length === 0) {
      return { success: false, message: 'Reservation already finalized.' };
    }

    const runOperations = async (runner: Prisma.TransactionClient) => {
      const skuIds = pendingReservations.map((r) => r.skuId);
      return this.wrapAvailabilityFlip(runner, skuIds, async () => {
        // Claim status transition atomically
        const affected = await runner.inventoryReservation.updateMany({
          where: {
            reservationCode,
            status: 'PENDING',
          },
          data: {
            status: 'RELEASED',
          },
        });

        if (affected.count !== pendingReservations.length) {
          return { success: false, message: 'Reservation already finalized.' };
        }

        // Decrement reserved stock atomically for all claimed reservations
        for (const reservation of pendingReservations) {
          await runner.skuInventory.update({
            where: {
              warehouseId_skuId: {
                warehouseId: reservation.warehouseId,
                skuId: reservation.skuId,
              },
            },
            data: {
              reserved: { decrement: reservation.quantity },
            },
          });

          // Log to ledger
          await runner.inventoryLedger.create({
            data: {
              skuId: reservation.skuId,
              warehouseId: reservation.warehouseId,
              quantityDelta: 0,
              reservedDelta: -reservation.quantity,
              type: 'RESERVATION_RELEASE',
              referenceId: reservation.id,
            },
          });
        }

        return { success: true, message: 'Reservation successfully released.' };
      });
    };

    if (tx) {
      return runOperations(tx);
    } else {
      return this.prisma.$transaction(runOperations);
    }
  }

  // --- Commit Reservation (Fulfill Order) ---
  async commitReservation(
    reservationCode: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    const reservations = await client.inventoryReservation.findMany({
      where: { reservationCode },
    });

    if (reservations.length === 0) {
      throw new NotFoundException('Reservation not found.');
    }

    const pendingReservations = reservations.filter(
      (r) => r.status === 'PENDING',
    );
    if (pendingReservations.length === 0) {
      throw new BadRequestException(
        `Reservation is no longer active (none are PENDING).`,
      );
    }

    // Verify that ALL matching reservations are indeed PENDING (no partial checkouts allowed)
    if (pendingReservations.length !== reservations.length) {
      throw new BadRequestException(
        `Reservation is no longer active (some rows already completed or released).`,
      );
    }

    const runOperations = async (runner: Prisma.TransactionClient) => {
      // Claim status transition atomically
      const affected = await runner.inventoryReservation.updateMany({
        where: {
          reservationCode,
          status: 'PENDING',
        },
        data: {
          status: 'COMPLETED',
          orderId,
        },
      });

      if (affected.count !== pendingReservations.length) {
        throw new BadRequestException(
          'Reservation is no longer active (expired or processed).',
        );
      }

      for (const reservation of pendingReservations) {
        // Deduct both physical onHand and reserved stock atomically
        await runner.skuInventory.update({
          where: {
            warehouseId_skuId: {
              warehouseId: reservation.warehouseId,
              skuId: reservation.skuId,
            },
          },
          data: {
            onHand: { decrement: reservation.quantity },
            reserved: { decrement: reservation.quantity },
          },
        });

        // Log to ledger
        await runner.inventoryLedger.create({
          data: {
            skuId: reservation.skuId,
            warehouseId: reservation.warehouseId,
            quantityDelta: -reservation.quantity,
            reservedDelta: -reservation.quantity,
            type: 'RESERVATION_FULFILL',
            referenceId: orderId,
          },
        });
      }

      return { success: true };
    };

    if (tx) {
      return runOperations(tx);
    } else {
      return this.prisma.$transaction(runOperations);
    }
  }

  private async getProductInStock(
    client: Prisma.TransactionClient,
    productId: string,
  ): Promise<boolean> {
    const skus = await client.sku.findMany({
      where: { variant: { productId } },
      include: {
        inventories: {
          select: {
            onHand: true,
            reserved: true,
          },
        },
      },
    });
    return skus.some((sku) =>
      sku.inventories.some((inv) => inv.onHand - inv.reserved > 0),
    );
  }

  private async getProductIdFromSkuId(
    client: Prisma.TransactionClient,
    skuId: string,
  ): Promise<string | null> {
    const sku = await client.sku.findUnique({
      where: { id: skuId },
      select: {
        variant: {
          select: {
            productId: true,
          },
        },
      },
    });
    return sku?.variant?.productId || null;
  }

  private async wrapAvailabilityFlip<T>(
    runner: Prisma.TransactionClient,
    skuIds: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    const distinctSkuIds = Array.from(new Set(skuIds));
    const productBeforeStates = new Map<string, boolean>();

    for (const skuId of distinctSkuIds) {
      const productId = await this.getProductIdFromSkuId(runner, skuId);
      if (productId && !productBeforeStates.has(productId)) {
        const inStock = await this.getProductInStock(runner, productId);
        productBeforeStates.set(productId, inStock);
      }
    }

    const result = await action();

    for (const [productId, beforeInStock] of productBeforeStates.entries()) {
      const afterInStock = await this.getProductInStock(runner, productId);
      if (beforeInStock !== afterInStock) {
        await runner.outboxEvent.create({
          data: {
            eventType: 'stock.availability_changed',
            payload: {
              productId,
              inStock: afterInStock,
            },
          },
        });
      }
    }

    return result;
  }
}
