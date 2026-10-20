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
  type SellerKycApprovalDto,
  type CommissionRuleUpdateDto,
  type ProductModerationDto,
  type ReviewModerationDto,
  type FinancialReportQueryDto,
} from '@marketplace/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

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
    const parsed = new ZodValidationPipe(SellerKycApprovalSchema).transform({
      sellerId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    }) as SellerKycApprovalDto;
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
  async setCommissionRule(
    @Body(new ZodValidationPipe(CommissionRuleUpdateSchema))
    body: CommissionRuleUpdateDto,
  ) {
    return this.adminService.setCommissionRule(body);
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
    const parsed = new ZodValidationPipe(ProductModerationSchema).transform({
      productId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    }) as ProductModerationDto;
    return this.adminService.moderateProduct(parsed.productId, parsed.status);
  }

  // --- 6. Moderate Review ---
  @Patch('reviews/:id/moderate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async moderateReview(@Param('id') reviewId: string, @Body() body: unknown) {
    const parsed = new ZodValidationPipe(ReviewModerationSchema).transform({
      reviewId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    }) as ReviewModerationDto;
    return this.adminService.moderateReview(parsed.reviewId, parsed.status);
  }

  // --- 7. Financial Ledger Summary ---
  @Get('finance/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getFinancialSummary(
    @Query(new ZodValidationPipe(FinancialReportQuerySchema))
    _query: FinancialReportQueryDto,
  ) {
    void _query;
    return this.adminService.getFinancialSummary();
  }
}
