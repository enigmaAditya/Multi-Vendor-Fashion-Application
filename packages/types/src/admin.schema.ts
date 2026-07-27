import { z } from 'zod';

export const SellerKycApprovalSchema = z.object({
  sellerId: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
});

export const CommissionRuleUpdateSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    sellerId: z.string().uuid().optional(),
    rateBasisPoints: z.number().int().min(0).max(10000).optional(),
    ratePercent: z.number().min(0).max(100).optional(),
  })
  .refine((data) => data.categoryId || data.sellerId, {
    message: 'Either categoryId or sellerId must be provided for a commission rule.',
  })
  .transform((data) => ({
    categoryId: data.categoryId,
    sellerId: data.sellerId,
    rateBasisPoints:
      data.rateBasisPoints !== undefined
        ? data.rateBasisPoints
        : Math.round((data.ratePercent ?? 5.0) * 100),
  }));

export const ProductModerationSchema = z.object({
  productId: z.string().uuid(),
  status: z.enum(['LIVE', 'REJECTED', 'SUSPENDED']),
  moderationNote: z.string().optional(),
});

export const ReviewModerationSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED']),
});

export const FinancialReportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type SellerKycApprovalDto = z.infer<typeof SellerKycApprovalSchema>;
export type CommissionRuleUpdateDto = z.infer<typeof CommissionRuleUpdateSchema>;
export type ProductModerationDto = z.infer<typeof ProductModerationSchema>;
export type ReviewModerationDto = z.infer<typeof ReviewModerationSchema>;
export type FinancialReportQueryDto = z.infer<typeof FinancialReportQuerySchema>;
