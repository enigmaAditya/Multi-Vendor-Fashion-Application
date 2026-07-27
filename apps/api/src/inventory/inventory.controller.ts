import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
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

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // --- Warehouse management ---
  @Post('warehouses')
  @Roles('ADMIN')
  async createWarehouse(
    @Body() body: { name: string; code: string; address?: string },
  ) {
    return this.inventoryService.createWarehouse(
      body.name,
      body.code,
      body.address,
    );
  }

  @Get('warehouses')
  async getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  // --- Stock replenishments ---
  @Post('stock')
  @Roles('SELLER', 'ADMIN')
  async addStock(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      skuId: string;
      warehouseId: string;
      quantityDelta: number;
      reason?: string;
    },
  ) {
    const sellerId = req.user.sub;
    return this.inventoryService.addStock(
      sellerId,
      body.skuId,
      body.warehouseId,
      body.quantityDelta,
      body.reason,
    );
  }

  @Get('sku/:skuId')
  async getStockLevel(@Param('skuId') skuId: string) {
    return this.inventoryService.getStockLevel(skuId);
  }

  // --- Checkout Holds / Reservations ---
  @Post('reserve')
  @Roles('USER', 'ADMIN')
  async reserveStock(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      skuId: string;
      warehouseId: string;
      quantity: number;
      reservationCode: string;
      ttlSeconds?: number;
    },
  ) {
    const userId = req.user.sub;
    const requestedTtl = body.ttlSeconds ?? 900;
    const effectiveTtl = Math.min(Math.max(requestedTtl, 60), 1800);
    return this.inventoryService.reserveStock(
      userId,
      body.skuId,
      body.warehouseId,
      body.quantity,
      body.reservationCode,
      effectiveTtl,
    );
  }

  @Post('release')
  @Roles('USER', 'ADMIN')
  async releaseReservation(
    @Req() req: RequestWithUser,
    @Body() body: { reservationCode: string },
  ) {
    const userId = req.user.sub;
    const isAdmin = req.user.roles?.includes('ADMIN') || false;
    return this.inventoryService.releaseReservation(
      userId,
      body.reservationCode,
      isAdmin,
    );
  }
}
