import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    roles: string[];
  };
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // --- Initialize checkout session ---
  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'ADMIN')
  async initializeCheckout(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      cartItems: { skuId: string; quantity: number }[];
      shippingAddress: any;
      couponCode?: string;
    },
  ) {
    const buyerId = req.user.sub;
    if (!body.cartItems || !body.shippingAddress) {
      throw new BadRequestException(
        'cartItems and shippingAddress are required.',
      );
    }
    const result = await this.ordersService.initializeCheckout(
      buyerId,
      body.cartItems,
      body.shippingAddress,
      body.couponCode,
    );
    return {
      orderId: result.orderId,
      gatewayOrderId: result.gatewayOrderId,
      totalAmount: result.totalAmount,
      discountAmount: result.discountAmount,
      amountCharged: result.amountCharged,
      reservationCode: result.reservationCode,
    };
  }

  // --- Guest Webhook Handler ---
  @Post('webhook')
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw request body is missing.');
    }
    if (!signature || !eventId) {
      throw new BadRequestException(
        'Webhook signature and event ID are required.',
      );
    }
    return this.ordersService.handlePaymentWebhook(rawBody, signature, eventId);
  }

  // --- Buyer order list ---
  @Get('my-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'ADMIN')
  async getMyOrders(@Req() req: RequestWithUser) {
    const buyerId = req.user.sub;
    const orders = await this.ordersService.getMyOrders(buyerId);
    return { orders };
  }

  // --- Seller order list ---
  @Get('seller-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  async getSellerOrders(@Req() req: RequestWithUser) {
    const sellerId = req.user.sub;
    const subOrders = await this.ordersService.getSellerOrders(sellerId);
    return { subOrders };
  }

  // --- Single Buyer Order Lookup (Buyer Scoped + IDOR Check) ---
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'ADMIN')
  async getOrderById(
    @Req() req: RequestWithUser,
    @Param('id') orderId: string,
  ) {
    const buyerId = req.user.sub;
    const isAdmin = req.user.roles.includes('ADMIN');
    return this.ordersService.getOrderById(buyerId, orderId, isAdmin);
  }
}
