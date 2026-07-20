import { z } from 'zod';

export const RecentlyViewedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const TrendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(90).default(7),
  categoryId: z.string().uuid().optional(),
});

export const SimilarQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  categoryId: z.string().uuid().optional(),
});

export const AlsoBoughtQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type RecentlyViewedQueryDto = z.infer<typeof RecentlyViewedQuerySchema>;
export type TrendingQueryDto = z.infer<typeof TrendingQuerySchema>;
export type SimilarQueryDto = z.infer<typeof SimilarQuerySchema>;
export type AlsoBoughtQueryDto = z.infer<typeof AlsoBoughtQuerySchema>;
