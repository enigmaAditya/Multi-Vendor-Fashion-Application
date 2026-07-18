import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PayoutsService } from '../payouts/payouts.service';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';

interface ShiprocketAuthResponse {
  token?: string;
}

interface ShippingAddress {
  name?: string;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  phone?: string;
}

interface ShiprocketOrderResponse {
  shipment_id?: string | number;
  awb_code?: string;
  courier_name?: string;
}

interface ShiprocketWebhookPayload {
  awb_code?: string;
  status?: string;
  shipment_id?: string | number;
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly payoutsService: PayoutsService,
  ) {}

  // --- Redis Locked Token Manager (Single-Flight Token Refresh) ---
  async getShiprocketToken(): Promise<string> {
    const redis = this.redisService.getClient();
    const cachedToken = await redis.get('shiprocket_token');
    if (cachedToken) {
      return cachedToken;
    }

    const lockKey = 'shiprocket_token_lock';
    // Acquire simple NX lock with 5 seconds expiry
    const acquired = await redis.set(lockKey, 'locked', 'EX', 5, 'NX');

    if (!acquired) {
      // Loop retry to wait for cached token from winner
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const token = await redis.get('shiprocket_token');
        if (token) return token;
      }
      throw new Error('Timeout waiting for Shiprocket token refresh');
    }

    try {
      const email = process.env.SHIPROCKET_EMAIL || 'dummy@dummy.com';
      const password = process.env.SHIPROCKET_PASSWORD || 'dummy_password';

      const response = await fetch(
        'https://apiv2.shiprocket.in/v1/external/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Shiprocket auth endpoint failed: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as ShiprocketAuthResponse;
      const token = data.token;
      if (!token) {
        throw new Error('Shiprocket response did not contain token');
      }

      // Cache token for 23 hours
      await redis.set('shiprocket_token', token, 'EX', 23 * 60 * 60);
      return token;
    } finally {
      await redis.del(lockKey);
    }
  }

  // --- Sync Shipment to Shiprocket (Outbox Job) ---
  async syncShipment(subOrderId: string) {
    // 1. Atomic status claim lock to avoid double calls
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
      this.logger.log(
        `Sub-order ${subOrderId} sync skipped (already sync'd or syncing)`,
      );
      return {
        success: false,
        message: 'Sync already processed or in-flight.',
      };
    }

    try {
      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id: subOrderId },
        include: {
          order: true,
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

      if (!subOrder || subOrder.items.length === 0) {
        throw new NotFoundException('Sub-order or order items not found.');
      }

      // Resolve warehouse pickup details (Assumes sub-order uses a single warehouse pickup location)
      const firstItem = subOrder.items[0];
      const reservation = await this.prisma.inventoryReservation.findFirst({
        where: {
          orderId: subOrder.orderId,
          skuId: firstItem.skuId,
          status: 'COMPLETED',
        },
        include: {
          warehouse: true,
        },
      });

      if (!reservation) {
        throw new Error(
          'No completed inventory reservation found to resolve pickup location.',
        );
      }

      const warehouse = reservation.warehouse;
      const shipping = subOrder.order
        .shippingAddress as unknown as ShippingAddress;

      const customerName = shipping.name || 'Customer';
      const address = shipping.address || 'Address';
      const city = shipping.city || 'City';
      const pincode = shipping.pincode || '110001';
      const state = shipping.state || 'State';
      const phone = shipping.phone || '+919999999999';

      const orderItems = subOrder.items.map((item) => ({
        name: item.sku.variant.product.name,
        sku: item.sku.id,
        units: item.quantity,
        selling_price: Number(item.price) / 100, // stored in paise, convert to rupees
      }));

      const token = await this.getShiprocketToken();
      const orderPayload = {
        order_id: subOrderId,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: warehouse.code,
        billing_customer_name: customerName,
        billing_last_name: '',
        billing_address: address,
        billing_address_2: '',
        billing_city: city,
        billing_pincode: pincode,
        billing_state: state,
        billing_country: 'India',
        billing_email: 'customer@test.com',
        billing_phone: phone,
        shipping_is_billing: true,
        order_items: orderItems,
        payment_method: 'Prepaid',
        sub_total: Number(subOrder.amount) / 100,
        length: 10,
        width: 10,
        height: 10,
        weight: 0.5,
      };

      const response = await fetch(
        'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(orderPayload),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Shiprocket API rejected order: ${response.statusText}`,
        );
      }

      const resData = (await response.json()) as ShiprocketOrderResponse;
      const shipmentId = resData.shipment_id ? String(resData.shipment_id) : '';
      const awbCode = resData.awb_code ? String(resData.awb_code) : '';
      const courierName = resData.courier_name
        ? String(resData.courier_name)
        : 'Shiprocket';

      await this.prisma.subOrder.update({
        where: { id: subOrderId },
        data: {
          shipmentStatus: 'SYNCED',
          shipmentId: shipmentId || null,
          awbCode: awbCode || null,
          courierName: courierName || null,
        },
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
        } else {
          // Update tracking states
          await tx.subOrder.update({
            where: { id: subOrder.id },
            data: { shipmentStatus: normalizedStatus },
          });
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
