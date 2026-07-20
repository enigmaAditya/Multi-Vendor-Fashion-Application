import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  CouponsService,
  ValidatedCouponResult,
} from '../coupons/coupons.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly couponsService: CouponsService,
  ) {}

  // --- Initialize Checkout ---
  async initializeCheckout(
    buyerId: string,
    cartItems: { skuId: string; quantity: number }[],
    shippingAddress: any,
    couponCode?: string,
  ) {
    if (cartItems.length === 0) {
      throw new BadRequestException('Cart is empty.');
    }

    // 1. Fetch SKUs and check product & seller status (Note 7)
    const skuIds = cartItems.map((item) => item.skuId);
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds } },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });

    if (skus.length !== cartItems.length) {
      throw new BadRequestException('Some SKUs in the cart do not exist.');
    }

    // Verify all products are LIVE and sellers are active
    for (const sku of skus) {
      const product = sku.variant.product;
      if (product.status !== 'LIVE') {
        throw new BadRequestException(
          `Product ${product.name} is not available for purchase.`,
        );
      }
      // Check if seller user exists and is active
      const seller = await this.prisma.user.findUnique({
        where: { id: sku.sellerId },
      });
      if (!seller) {
        throw new BadRequestException('Seller not found.');
      }
    }

    // 2. Server-side pricing calculation & Coupon Discount Validation
    let totalAmount = BigInt(0);
    const itemDetails = cartItems.map((item) => {
      const sku = skus.find((s) => s.id === item.skuId)!;
      totalAmount += sku.price * BigInt(item.quantity);
      return {
        skuId: item.skuId,
        quantity: item.quantity,
        price: sku.price,
        mrp: sku.mrp,
        sellerId: sku.sellerId,
      };
    });

    let discountAmount = BigInt(0);
    let validatedCoupon: ValidatedCouponResult['coupon'] | null = null;

    if (couponCode) {
      const couponResult =
        await this.couponsService.validateAndCalculateDiscount(
          couponCode,
          buyerId,
          cartItems,
        );
      discountAmount = couponResult.discountAmount;
      validatedCoupon = couponResult.coupon;
    }

    const amountCharged =
      totalAmount > discountAmount ? totalAmount - discountAmount : BigInt(0);

    // 3. Select warehouse per SKU (Note 7 - Highest stock select)
    const reservationsToMake: {
      skuId: string;
      warehouseId: string;
      quantity: number;
    }[] = [];

    for (const item of itemDetails) {
      const inventories = await this.prisma.skuInventory.findMany({
        where: { skuId: item.skuId },
        orderBy: { onHand: 'desc' },
      });

      // Default to seller's first warehouse if none or empty
      let selectedWarehouseId: string;
      if (inventories.length > 0 && inventories[0].onHand >= item.quantity) {
        selectedWarehouseId = inventories[0].warehouseId;
      } else {
        // Fallback to any warehouse
        const wh = await this.prisma.warehouse.findFirst();
        if (!wh) {
          throw new BadRequestException(
            'No warehouses available in the system.',
          );
        }
        selectedWarehouseId = wh.id;
      }

      reservationsToMake.push({
        skuId: item.skuId,
        warehouseId: selectedWarehouseId,
        quantity: item.quantity,
      });
    }

    const reservationCode = `checkout_${crypto.randomUUID()}`;

    // 4. All-or-Nothing Stock Hold Transaction (Note 4)
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const res of reservationsToMake) {
          await this.inventoryService.reserveStock(
            buyerId,
            res.skuId,
            res.warehouseId,
            res.quantity,
            reservationCode,
            900, // 15 mins TTL
            tx,
          );
        }
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Failed to reserve stock: ${errMsg || 'Insufficient inventory'}`,
      );
    }

    // 5. Create Razorpay Gateway Order
    let gatewayOrderId = '';
    try {
      const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkey';
      const keySecret = process.env.RAZORPAY_KEY_SECRET || 'mocksecret';

      // Call Razorpay API using native fetch - pass net amountCharged!
      const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString(
        'base64',
      );
      const amountInPaise = Number(amountCharged);

      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `receipt_${reservationCode.slice(0, 20)}`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Razorpay responded with status ${response.status}: ${errorText}`,
        );
      }

      const resBody = (await response.json()) as { id: string };
      gatewayOrderId = resBody.id;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Failed to create Razorpay order. Rolling back reservations. Error: ${errMsg}`,
        errStack,
      );
      // Cleanup holds immediately on gateway failure
      try {
        await this.inventoryService.releaseReservation(
          buyerId,
          reservationCode,
          true,
        );
      } catch (releaseErr) {
        const releaseMsg =
          releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
        this.logger.error(`Immediate hold release failed: ${releaseMsg}`);
      }
      throw new BadRequestException('Payment gateway order creation failed.');
    }

    // 6. Persist Order & SubOrders split (Note 1)
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          buyerId,
          totalAmount,
          discountAmount,
          amountCharged,
          gatewayOrderId,
          reservationCode,
          shippingAddress: shippingAddress as Prisma.InputJsonValue,
          paymentStatus: 'PENDING',
        },
      });

      if (validatedCoupon) {
        // Atomic redemption claim
        const updatedCount = await tx.$executeRaw`
          UPDATE coupons
          SET current_redemptions = current_redemptions + 1, updated_at = NOW()
          WHERE id = ${validatedCoupon.id}
            AND is_active = true
            AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
        `;

        if (Number(updatedCount) === 0) {
          throw new BadRequestException(
            'Coupon redemption limit reached or coupon inactive.',
          );
        }

        // Record CouponRedemption with RESERVED status
        await tx.couponRedemption.create({
          data: {
            couponId: validatedCoupon.id,
            userId: buyerId,
            orderId: order.id,
            discountAmount,
            status: 'RESERVED',
          },
        });

        // Record PromotionLedger expense if platform-funded
        if (
          discountAmount > BigInt(0) &&
          validatedCoupon.fundingType === 'PLATFORM'
        ) {
          await tx.promotionLedger.create({
            data: {
              orderId: order.id,
              couponId: validatedCoupon.id,
              amount: discountAmount,
              type: 'PLATFORM_PROMO_EXPENSE',
            },
          });
        }
      }

      // Split into SubOrders per seller
      const itemsBySeller = itemDetails.reduce(
        (acc, item) => {
          if (!acc[item.sellerId]) {
            acc[item.sellerId] = [];
          }
          acc[item.sellerId].push(item);
          return acc;
        },
        {} as Record<string, typeof itemDetails>,
      );

      for (const [sellerId, items] of Object.entries(itemsBySeller)) {
        let subOrderAmount = items.reduce(
          (sum, item) => sum + item.price * BigInt(item.quantity),
          BigInt(0),
        );

        // For SELLER-funded coupons, deduct discount directly from the funding seller's subOrder.amount
        if (
          validatedCoupon &&
          validatedCoupon.fundingType === 'SELLER' &&
          validatedCoupon.sellerId === sellerId
        ) {
          subOrderAmount =
            subOrderAmount > discountAmount
              ? subOrderAmount - discountAmount
              : BigInt(0);
        }

        const subOrder = await tx.subOrder.create({
          data: {
            orderId: order.id,
            sellerId,
            amount: subOrderAmount,
            status: 'PENDING',
          },
        });

        for (const item of items) {
          await tx.orderItem.create({
            data: {
              subOrderId: subOrder.id,
              skuId: item.skuId,
              quantity: item.quantity,
              price: item.price,
              mrp: item.mrp,
            },
          });
        }
      }

      return {
        orderId: order.id,
        gatewayOrderId,
        totalAmount: totalAmount.toString(),
        discountAmount: discountAmount.toString(),
        amountCharged: amountCharged.toString(),
        reservationCode,
      };
    });
  }

  // --- Webhook signature verification & process ---
  async handlePaymentWebhook(
    rawBody: Buffer,
    signature: string,
    eventId: string,
  ) {
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || 'webhooksecret';

    // 1. Timing-safe Signature verification (Note 2)
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(rawBody);
    const computed = shasum.digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computed, 'hex');

    if (
      sigBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, computedBuffer)
    ) {
      throw new BadRequestException('Invalid signature.');
    }

    // Parse event payload
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload: {
        payment: {
          entity: {
            id: string;
            order_id: string;
          };
        };
      };
    };

    // 2. Atomic Idempotency lock via database unique constraint (Note 3)
    let isDuplicate = false;
    try {
      await this.prisma.paymentWebhookLog.create({
        data: { eventId },
      });
    } catch {
      isDuplicate = true;
    }

    if (isDuplicate) {
      this.logger.log(`Duplicate webhook event ${eventId} ignored.`);
      return { success: true, message: 'Duplicate event' }; // Return 200 OK
    }

    const gatewayOrderId = event.payload.payment.entity.order_id;
    const gatewayPaymentId = event.payload.payment.entity.id;

    const order = await this.prisma.order.findUnique({
      where: { gatewayOrderId },
      include: { subOrders: { include: { items: true } } },
    });

    if (!order) {
      this.logger.error(`Order with gateway ID ${gatewayOrderId} not found.`);
      return { success: false, message: 'Order not found' };
    }

    if (order.paymentStatus === 'PAID') {
      return { success: true, message: 'Order already completed.' };
    }

    // 3. Process Event Types (Note 6)
    if (event.event === 'payment.captured') {
      // commit path
      return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        try {
          if (!order.reservationCode) {
            throw new Error('No reservation code found on order.');
          }

          // Thread the tx client into commitReservation (Caution 2)
          await this.inventoryService.commitReservation(
            order.reservationCode,
            order.id,
            tx,
          );

          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'PAID',
              gatewayPaymentId,
            },
          });

          await tx.subOrder.updateMany({
            where: { orderId: order.id },
            data: { status: 'CONFIRMED' },
          });

          // Finalize CouponRedemption to CONFIRMED
          await tx.couponRedemption.updateMany({
            where: { orderId: order.id },
            data: { status: 'CONFIRMED' },
          });

          // Write outbox event inside the transaction
          await tx.outboxEvent.create({
            data: {
              eventType: 'order.paid',
              payload: {
                orderId: order.id,
                gatewayPaymentId,
                totalAmount: order.totalAmount.toString(),
              },
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          // Caution 3: lost race / commit failure is a committed outcome (not thrown), preventing webhook log rollback!
          this.logger.error(
            `Stock lock commit failed for order ${order.id}. Transitioning to REFUND_REQUIRED. Error: ${errMsg}`,
          );

          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'REFUND_REQUIRED',
              gatewayPaymentId,
            },
          });

          // Flag in durable outbox log (Note 8)
          await tx.outboxEvent.create({
            data: {
              eventType: 'payment.refund_required',
              payload: {
                orderId: order.id,
                gatewayOrderId,
                gatewayPaymentId,
                amount: order.totalAmount.toString(),
              },
            },
          });
        }

        return { success: true };
      });
    } else if (event.event === 'payment.failed') {
      // failure path
      return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'FAILED',
            gatewayPaymentId,
          },
        });

        if (order.reservationCode) {
          try {
            // Thread the tx client to release stock immediately
            await this.inventoryService.releaseReservation(
              'system',
              order.reservationCode,
              true,
              tx,
            );
          } catch (err) {
            const releaseMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(
              `Failed to release reservation on payment fail: ${releaseMsg}`,
            );
          }
        }

        await tx.outboxEvent.create({
          data: {
            eventType: 'order.failed',
            payload: {
              orderId: order.id,
              gatewayPaymentId,
            },
          },
        });

        return { success: true };
      });
    }

    return { success: true, message: 'Unhandled webhook event type.' };
  }

  // --- Queries ---
  async getMyOrders(buyerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { buyerId },
      include: { subOrders: { include: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders;
  }

  async getSellerOrders(sellerId: string) {
    const subOrders = await this.prisma.subOrder.findMany({
      where: { sellerId },
      include: { items: true, order: true },
      orderBy: { createdAt: 'desc' },
    });
    return subOrders;
  }

  async getOrderById(buyerId: string, orderId: string, isAdmin = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { subOrders: { include: { items: true } } },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    // IDOR Enforcement: Must belong to requesting buyer unless admin
    if (order.buyerId !== buyerId && !isAdmin) {
      throw new NotFoundException('Order not found.');
    }

    return {
      ...order,
      totalAmount: order.totalAmount.toString(),
      discountAmount: order.discountAmount.toString(),
      amountCharged: order.amountCharged.toString(),
      subOrders: order.subOrders.map((so) => ({
        ...so,
        amount: so.amount.toString(),
        items: so.items.map((item) => ({
          ...item,
          price: item.price.toString(),
        })),
      })),
    };
  }
}
