import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from '../payouts/payouts.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

interface ShiprocketOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: number;
  }>;
  payment_method: 'Prepaid' | 'COD';
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

interface ShiprocketOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
  onboarding_completed_now: number;
  awb_code?: string;
  courier_name?: string;
}

import { RedisService } from '../redis/redis.service';

interface ShiprocketWebhookPayload {
  awb_code?: string;
  shipment_id?: string | number;
  status?: string;
  courier_name?: string;
}

export function mapShiprocketStatusToEnum(rawStatus: string): string {
  const statusUpper = String(rawStatus || '')
    .toUpperCase()
    .trim();
  switch (statusUpper) {
    case 'PICKED UP':
    case 'PICKUP':
    case 'DISPATCHED':
    case 'SHIPPED':
    case 'IN TRANSIT':
    case 'OUT FOR DELIVERY':
      return 'IN_TRANSIT';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'RTO':
    case 'RTO IN TRANSIT':
    case 'RTO DELIVERED':
    case 'RETURNED':
      return 'RTO';
    case 'CANCELED':
    case 'CANCELLED':
      return 'CANCELLED';
    case 'LOST':
      return 'LOST';
    case 'SYNCING':
      return 'SYNCING';
    case 'SYNCED':
      return 'SYNCED';
    case 'FAILED_SYNC':
      return 'FAILED_SYNC';
    default:
      return 'IN_TRANSIT';
  }
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutsService: PayoutsService,
    private readonly redis: RedisService,
  ) {}

  async getShiprocketToken(): Promise<string> {
    const client = this.redis.getClient();
    const cachedToken = await client.get('shiprocket_token');
    if (cachedToken) {
      return cachedToken;
    }

    const acquiredLock = await client.set(
      'shiprocket_token_lock',
      'locked',
      'EX',
      5,
      'NX',
    );

    if (!acquiredLock) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return this.getShiprocketToken();
    }

    try {
      const authUrl =
        process.env.SHIPROCKET_AUTH_URL ||
        'https://apiv2.shiprocket.in/v1/external/auth/login';
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.SHIPROCKET_EMAIL || 'test@example.com',
          password: process.env.SHIPROCKET_PASSWORD || 'password',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to authenticate with Shiprocket API');
      }

      const data = (await response.json()) as { token: string };
      await client.set('shiprocket_token', data.token, 'EX', 23 * 60 * 60);
      return data.token;
    } finally {
      await client.del('shiprocket_token_lock');
    }
  }

  // --- Real-time Tracking Info ---
  async getTrackingInfo(subOrderId: string, userId: string) {
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: {
        order: { select: { buyerId: true } },
        items: {
          include: {
            sku: {
              include: {
                variant: {
                  include: { product: true },
                },
              },
            },
          },
        },
      },
    });

    if (!subOrder) {
      throw new NotFoundException('Sub-order not found.');
    }

    // IDOR check: Buyer of order or Seller of sub-order
    if (subOrder.order.buyerId !== userId && subOrder.sellerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view tracking for this sub-order.',
      );
    }

    return {
      subOrderId: subOrder.id,
      orderId: subOrder.orderId,
      status: subOrder.status,
      shipmentStatus: subOrder.shipmentStatus,
      courierName: subOrder.courierName,
      awbCode: subOrder.awbCode,
      shipmentId: subOrder.shipmentId,
      items: subOrder.items.map((item) => ({
        id: item.id,
        skuId: item.skuId,
        productName: item.sku.variant.product.name,
        size: item.sku.size,
        color: item.sku.variant.color,
        quantity: item.quantity,
      })),
    };
  }

  // --- Shiprocket Order Fulfillment Sync ---
  async syncShipment(subOrderId: string, sellerId?: string) {
    const claim = await this.prisma.subOrder.updateMany({
      where: {
        id: subOrderId,
        shipmentStatus: { in: ['PENDING_SYNC', 'FAILED_SYNC'] },
      },
      data: {
        shipmentStatus: 'SYNCING',
      },
    });

    if (claim.count === 0) {
      return {
        success: false,
        message: 'Sync already processed or in-flight.',
      };
    }

    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: {
        order: {
          include: {
            buyer: true,
          },
        },
        items: {
          include: {
            sku: {
              include: {
                variant: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!subOrder) {
      throw new NotFoundException('Sub-order not found.');
    }

    // IDOR check: Seller must own subOrder if not admin
    if (sellerId && subOrder.sellerId !== sellerId) {
      // Revert status claim
      await this.prisma.subOrder.update({
        where: { id: subOrderId },
        data: { shipmentStatus: 'PENDING_SYNC' },
      });
      throw new ForbiddenException(
        'You do not have permission to dispatch this sub-order.',
      );
    }

    if (subOrder.status && subOrder.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Sub-order must be in CONFIRMED state to sync shipment.',
      );
    }

    if (
      subOrder.shipmentStatus === 'SYNCED' ||
      subOrder.shipmentStatus === 'IN_TRANSIT' ||
      subOrder.shipmentStatus === 'DELIVERED'
    ) {
      return {
        success: true,
        message: 'Sub-order already synced to Shiprocket.',
        shipmentId: subOrder.shipmentId,
        awbCode: subOrder.awbCode,
      };
    }

    // Prepare Shiprocket B2C Order Payload
    const shippingAddr = (subOrder.order?.shippingAddress || {}) as Record<
      string,
      string
    >;
    const buyerName =
      shippingAddr.fullName || subOrder.order?.buyer?.phone || 'Customer';
    const buyerEmail =
      subOrder.order?.buyer?.email || 'customer@marketplace.com';

    const orderItems = subOrder.items.map((item) => ({
      name: item.sku.variant.product.name,
      sku: item.sku.skuCode,
      units: item.quantity,
      selling_price: Number(item.price) / 100, // Paise to Rupees
    }));

    const orderDate = subOrder.createdAt
      ? new Date(subOrder.createdAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const totalWeight = Math.max(
      0.5,
      subOrder.items.reduce((acc, i) => acc + i.quantity * 0.2, 0),
    );

    const payload: ShiprocketOrderPayload = {
      order_id: subOrder.id,
      order_date: orderDate,
      pickup_location: 'Primary Warehouse',
      billing_customer_name: buyerName,
      billing_address:
        shippingAddr.street || shippingAddr.address || 'Address Line 1',
      billing_city: shippingAddr.city || 'Mumbai',
      billing_pincode: shippingAddr.pincode || '400001',
      billing_state: shippingAddr.state || 'Maharashtra',
      billing_country: shippingAddr.country || 'India',
      billing_email: buyerEmail,
      billing_phone: subOrder.order?.buyer?.phone || '+919999999999',
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: 'Prepaid',
      sub_total: Number(subOrder.amount) / 100,
      length: 10,
      breadth: 10,
      height: 10,
      weight: totalWeight,
    };

    try {
      const shiprocketToken = await this.getShiprocketToken();
      const shiprocketApiUrl =
        process.env.SHIPROCKET_API_URL ||
        'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc';
      const response = await fetch(shiprocketApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${shiprocketToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Shiprocket API responded with status ${response.status}`,
        );
      }

      const resData = (await response.json()) as ShiprocketOrderResponse;
      const shipmentId = resData.shipment_id ? String(resData.shipment_id) : '';
      const awbCode = resData.awb_code ? String(resData.awb_code) : '';
      const courierName = resData.courier_name
        ? String(resData.courier_name)
        : 'Shiprocket';

      await this.prisma.$transaction(async (tx) => {
        await tx.subOrder.update({
          where: { id: subOrderId },
          data: {
            shipmentStatus: 'SYNCED',
            shipmentId: shipmentId || null,
            awbCode: awbCode || null,
            courierName: courierName || null,
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'shipment.dispatched',
            payload: JSON.stringify({
              subOrderId,
              orderId: subOrder.orderId,
              awbCode: awbCode || null,
              courierName: courierName || 'Shiprocket',
            }),
          },
        });
      });

      return { success: true, shipmentId, awbCode };
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Failed to sync sub-order ${subOrderId} to Shiprocket: ${error.message}`,
      );
      // Revert status to FAILED_SYNC to allow retry
      await this.prisma.subOrder.update({
        where: { id: subOrderId },
        data: {
          shipmentStatus: 'FAILED_SYNC',
        },
      });
      throw error;
    }
  }

  // --- Idempotent Webhook Callback Handler (Delivered/RTO paths) ---
  async handleWebhook(signature: string | undefined, payload: unknown) {
    const expectedToken =
      process.env.SHIPROCKET_WEBHOOK_TOKEN || 'test_webhook_token';
    if (!signature) {
      throw new BadRequestException('Missing signature header.');
    }

    // Verify token authenticity using timing-safe comparator
    const signatureBuffer = Buffer.from(signature);
    const tokenBuffer = Buffer.from(expectedToken);
    if (
      signatureBuffer.length !== tokenBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, tokenBuffer)
    ) {
      throw new ForbiddenException('Invalid webhook signature.');
    }

    const webhookPayload = payload as ShiprocketWebhookPayload;
    const {
      awb_code: awbCode,
      status,
      shipment_id: shipmentId,
    } = webhookPayload;
    if (!awbCode || !status) {
      return { success: true, message: 'Skipped invalid payload.' };
    }

    const normalizedStatus = String(status).toUpperCase();

    // Locate matching sub-order
    const subOrder = await this.prisma.subOrder.findFirst({
      where: {
        OR: [
          { awbCode },
          { shipmentId: shipmentId ? String(shipmentId) : undefined },
        ],
      },
      include: {
        items: true,
      },
    });

    if (!subOrder) {
      return {
        success: true,
        message: 'Sub-order not found for shipment AWB.',
      };
    }

    try {
      // Execute idempotency log insert + state transition atomically inside transaction
      await this.prisma.$transaction(async (tx) => {
        await tx.shipmentWebhookLog.create({
          data: {
            awbCode,
            status: normalizedStatus,
          },
        });

        if (normalizedStatus === 'DELIVERED') {
          // Reuses the processDelivery atomic guard and escrow triggers
          await this.payoutsService.processDelivery(subOrder.id, 604800, tx);
          await tx.outboxEvent.create({
            data: {
              eventType: 'shipment.delivered',
              payload: JSON.stringify({
                subOrderId: subOrder.id,
                orderId: subOrder.orderId,
              }),
            },
          });
        } else if (
          normalizedStatus === 'RTO' ||
          normalizedStatus === 'RETURNED'
        ) {
          try {
            await this.payoutsService.cancelPayout(subOrder.id, tx);
          } catch (err: unknown) {
            // If already settled, write clawback flags and raise alert event
            if (err instanceof BadRequestException) {
              await tx.subOrder.update({
                where: { id: subOrder.id },
                data: { settlementStatus: 'CLAWBACK_REQUIRED' },
              });
              await tx.outboxEvent.create({
                data: {
                  eventType: 'payout.clawback_required',
                  payload: JSON.stringify({
                    subOrderId: subOrder.id,
                    amount: String(subOrder.amount),
                  }),
                },
              });
            } else {
              throw err;
            }
          }

          // Check availability before restocking
          const skuIds = subOrder.items.map((item) => item.skuId);
          const productBeforeStates = new Map<string, boolean>();
          for (const skuId of skuIds) {
            const sku = await tx.sku.findUnique({
              where: { id: skuId },
              select: { variant: { select: { productId: true } } },
            });
            const productId = sku?.variant.productId;
            if (productId && !productBeforeStates.has(productId)) {
              const count = await tx.skuInventory.aggregate({
                where: {
                  sku: { variant: { productId } },
                },
                _sum: { onHand: true, reserved: true },
              });
              const onHandSum = count._sum.onHand || 0;
              const reservedSum = count._sum.reserved || 0;
              productBeforeStates.set(productId, onHandSum - reservedSum > 0);
            }
          }

          // Restock items from active reservations
          for (const item of subOrder.items) {
            const reservations = await tx.inventoryReservation.findMany({
              where: {
                orderId: subOrder.orderId,
                skuId: item.skuId,
                status: 'COMPLETED',
              },
            });

            for (const res of reservations) {
              await tx.skuInventory.update({
                where: {
                  warehouseId_skuId: {
                    warehouseId: res.warehouseId,
                    skuId: res.skuId,
                  },
                },
                data: {
                  onHand: { increment: res.quantity },
                },
              });

              await tx.inventoryLedger.create({
                data: {
                  skuId: res.skuId,
                  warehouseId: res.warehouseId,
                  quantityDelta: res.quantity,
                  reservedDelta: 0,
                  type: 'RETURN_RESTOCK',
                  referenceId: subOrder.id,
                },
              });

              await tx.inventoryReservation.update({
                where: { id: res.id },
                data: { status: 'RETURNED' },
              });
            }
          }

          // Check availability after restocking and emit if changed
          for (const [
            productId,
            beforeInStock,
          ] of productBeforeStates.entries()) {
            const skus = await tx.sku.findMany({
              where: { variant: { productId } },
              include: { inventories: true },
            });
            const afterInStock = skus.some((s) =>
              s.inventories.some((inv) => inv.onHand - inv.reserved > 0),
            );
            if (beforeInStock !== afterInStock) {
              await tx.outboxEvent.create({
                data: {
                  eventType: 'stock.availability_changed',
                  payload: JSON.stringify({
                    productId,
                    inStock: afterInStock,
                  }),
                },
              });
            }
          }
        } else {
          // Update tracking states
          await tx.subOrder.update({
            where: { id: subOrder.id },
            data: {
              shipmentStatus: mapShiprocketStatusToEnum(normalizedStatus),
            },
          });

          // Map Shiprocket real webhook status strings to outbox events
          if (
            normalizedStatus === 'PICKED UP' ||
            normalizedStatus === 'PICKUP' ||
            normalizedStatus === 'DISPATCHED' ||
            normalizedStatus === 'IN TRANSIT'
          ) {
            await tx.outboxEvent.create({
              data: {
                eventType: 'shipment.dispatched',
                payload: JSON.stringify({
                  subOrderId: subOrder.id,
                  orderId: subOrder.orderId,
                  awbCode: subOrder.awbCode,
                  courierName: subOrder.courierName,
                }),
              },
            });
          } else if (normalizedStatus === 'OUT FOR DELIVERY') {
            await tx.outboxEvent.create({
              data: {
                eventType: 'shipment.out_for_delivery',
                payload: JSON.stringify({
                  subOrderId: subOrder.id,
                  orderId: subOrder.orderId,
                }),
              },
            });
          }
        }
      });

      return { success: true };
    } catch (err: unknown) {
      // A P2002 error indicates a duplicate callback log, acknowledge 200 to stop retry
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { success: true, message: 'Duplicate webhook event.' };
      }
      throw err;
    }
  }
}
