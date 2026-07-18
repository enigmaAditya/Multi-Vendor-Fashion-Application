import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
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

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  // --- Admin Deliver Sub-Order (triggers delayed settlement job) ---
  @Post('admin/sub-orders/:subOrderId/deliver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async deliverSubOrder(
    @Param('subOrderId') subOrderId: string,
    @Body() body: { escrowDelaySeconds?: number },
  ) {
    return this.payoutsService.processDelivery(
      subOrderId,
      body.escrowDelaySeconds,
    );
  }

  // --- Seller link payout account ---
  @Post('sellers/payout-account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  async linkPayoutAccount(
    @Req() req: RequestWithUser,
    @Body() body: { gatewayAccountId: string },
  ) {
    if (!body.gatewayAccountId) {
      throw new BadRequestException('gatewayAccountId is required.');
    }
    const sellerId = req.user.sub;
    return this.payoutsService.linkSellerAccount(
      sellerId,
      body.gatewayAccountId,
    );
  }

  // --- Seller get payout history ---
  @Get('sellers/my-payouts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  async getMyPayouts(@Req() req: RequestWithUser) {
    const sellerId = req.user.sub;
    const payouts = await this.payoutsService.getSellerPayouts(sellerId);
    return { payouts };
  }

  // --- Admin inspect commission ledger ---
  @Get('admin/commission-ledger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getCommissionLedger() {
    const ledger = await this.payoutsService.getCommissionLedger();
    return { ledger };
  }
}
