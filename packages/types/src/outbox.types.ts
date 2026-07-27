import { z } from 'zod';

export const OrderPaidPayloadSchema = z.object({
  orderId: z.string().uuid(),
  buyerId: z.string().uuid(),
  totalAmount: z.string(),
  subOrderIds: z.array(z.string().uuid()),
});

export const ShipmentDispatchedPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  orderId: z.string().uuid(),
  awbCode: z.string().optional(),
  courierName: z.string().optional(),
});

export const ShipmentDeliveredPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  orderId: z.string().uuid(),
});

export const PayoutSettledPayloadSchema = z.object({
  payoutId: z.string().uuid(),
  subOrderId: z.string().uuid(),
  sellerId: z.string().uuid(),
  amount: z.string(),
});

export const SellerApprovedPayloadSchema = z.object({
  sellerId: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED']),
});

export const ProductUpdatedPayloadSchema = z.object({
  productId: z.string().uuid(),
  status: z.string(),
  name: z.string(),
  slug: z.string(),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
});

export const ReviewModeratedPayloadSchema = z.object({
  reviewId: z.string().uuid(),
  productId: z.string().uuid(),
  buyerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  status: z.enum(['APPROVED', 'REJECTED', 'FLAGGED']),
});

export type OrderPaidPayload = z.infer<typeof OrderPaidPayloadSchema>;
export type ShipmentDispatchedPayload = z.infer<typeof ShipmentDispatchedPayloadSchema>;
export type ShipmentDeliveredPayload = z.infer<typeof ShipmentDeliveredPayloadSchema>;
export type PayoutSettledPayload = z.infer<typeof PayoutSettledPayloadSchema>;
export type SellerApprovedPayload = z.infer<typeof SellerApprovedPayloadSchema>;
export type ProductUpdatedPayload = z.infer<typeof ProductUpdatedPayloadSchema>;
export type ReviewModeratedPayload = z.infer<typeof ReviewModeratedPayloadSchema>;
