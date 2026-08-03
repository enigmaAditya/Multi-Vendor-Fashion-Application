import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { LogisticsService } from './logistics.service';
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

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  // --- Shiprocket Webhook Receiver ---
  @Post('shiprocket-webhook')
  async handleWebhook(
    @Headers('x-api-key') apiKeyHeader: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    const signature = apiKeyHeader || authHeader;
    return this.logisticsService.handleWebhook(signature, payload);
  }

  // --- Manual admin sync trigger ---
  @Post('admin/sub-orders/:subOrderId/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async manualSync(@Param('subOrderId') subOrderId: string) {
    if (!subOrderId) {
      throw new BadRequestException('subOrderId is required.');
    }
    return this.logisticsService.syncShipment(subOrderId);
  }

  // --- Seller Sub-Order Dispatch Trigger ---
  @Post('seller/sub-orders/:subOrderId/dispatch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  async sellerDispatch(
    @Req() req: RequestWithUser,
    @Param('subOrderId') subOrderId: string,
  ) {
    if (!subOrderId) {
      throw new BadRequestException('subOrderId is required.');
    }
    const isAdmin = req.user.roles.includes('ADMIN');
    return this.logisticsService.syncShipment(
      subOrderId,
      isAdmin ? undefined : req.user.sub,
    );
  }
}
