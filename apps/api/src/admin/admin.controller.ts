import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  SellerKycApprovalSchema,
  CommissionRuleUpdateSchema,
  ProductModerationSchema,
  ReviewModerationSchema,
  FinancialReportQuerySchema,
} from '@marketplace/types';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // --- 1. List Sellers ---
  @Get('sellers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listSellers(@Query('kycStatus') kycStatus?: string) {
    return this.adminService.listSellers(kycStatus);
  }

  // --- 2. Approve / Reject Seller KYC ---
  @Patch('sellers/:id/kyc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async approveSellerKyc(@Param('id') sellerId: string, @Body() body: unknown) {
    const parsed = SellerKycApprovalSchema.parse({
      sellerId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    });
    return this.adminService.approveSellerKyc(
      parsed.sellerId,
      parsed.status,
      parsed.rejectionReason,
    );
  }

  // --- 3. Set Commission Rule ---
  @Post('commissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async setCommissionRule(@Body() body: unknown) {
    const parsed = CommissionRuleUpdateSchema.parse(body || {});
    return this.adminService.setCommissionRule(parsed);
  }

  // --- 4. Moderation Queue (Products) ---
  @Get('catalog/moderation-queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listPendingProducts(@Query('limit') limit?: number) {
    const take = limit ? Number(limit) : 20;
    return this.adminService.listPendingProducts(take);
  }

  // --- 5. Moderate Product Status ---
  @Patch('catalog/products/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async moderateProduct(@Param('id') productId: string, @Body() body: unknown) {
    const parsed = ProductModerationSchema.parse({
      productId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    });
    return this.adminService.moderateProduct(parsed.productId, parsed.status);
  }

  // --- 6. Moderate Review ---
  @Patch('reviews/:id/moderate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async moderateReview(@Param('id') reviewId: string, @Body() body: unknown) {
    const parsed = ReviewModerationSchema.parse({
      reviewId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    });
    return this.adminService.moderateReview(parsed.reviewId, parsed.status);
  }

  // --- 7. Financial Ledger Summary ---
  @Get('finance/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getFinancialSummary(@Query() query: unknown) {
    FinancialReportQuerySchema.parse(query || {});
    return this.adminService.getFinancialSummary();
  }
}
