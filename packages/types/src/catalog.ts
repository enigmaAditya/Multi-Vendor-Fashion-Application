import { z } from "zod";

export const CreateCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  parentId: z.string().uuid().optional().nullable(),
});

export const CreateBrandSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
});

export const SkuInputSchema = z
  .object({
    skuCode: z.string().min(1),
    size: z.string().min(1),
    price: z.number().int().nonnegative(),
    mrp: z.number().int().nonnegative(),
  })
  .refine((data) => data.mrp >= data.price, {
    message: "MRP must be greater than or equal to price",
    path: ["mrp"],
  });

export const VariantInputSchema = z.object({
  color: z.string().min(1),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        isPrimary: z.boolean().default(false),
      }),
    )
    .min(1, "At least one image is required per variant"),
  skus: z
    .array(SkuInputSchema)
    .min(1, "At least one SKU is required per variant"),
});

export const CreateProductSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  description: z.string().min(1).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  sizeChartId: z.string().uuid().optional().nullable(),
  attributes: z.array(z.string().uuid()).default([]),
  variants: z
    .array(VariantInputSchema)
    .min(1, "At least one variant is required"),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().min(1).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  sizeChartId: z.string().uuid().optional().nullable(),
  attributes: z.array(z.string().uuid()).optional(),
  variants: z.array(VariantInputSchema).optional(),
});

export const ModerateProductSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "SUSPEND"]),
  reason: z.string().optional(),
});

export const ProductFilterSchema = z.object({
  page: z
    .preprocess((val) => Number(val) || 1, z.number().int().positive())
    .default(1),
  limit: z
    .preprocess((val) => Number(val) || 10, z.number().int().positive())
    .default(10),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  priceMin: z.preprocess(
    (val) => (val !== undefined ? Number(val) : undefined),
    z.number().int().nonnegative().optional(),
  ),
  priceMax: z.preprocess(
    (val) => (val !== undefined ? Number(val) : undefined),
    z.number().int().nonnegative().optional(),
  ),
  attributes: z.preprocess(
    (val) => (typeof val === "string" ? [val] : val),
    z.array(z.string().uuid()).optional(),
  ),
  sort: z
    .enum(["PRICE_ASC", "PRICE_DESC", "NEWEST", "RECOMMENDED"])
    .default("NEWEST"),
});

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type CreateBrandDto = z.infer<typeof CreateBrandSchema>;
export type CreateProductDto = z.infer<typeof CreateProductSchema>;
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;
export type ModerateProductDto = z.infer<typeof ModerateProductSchema>;
export type ProductFilterQuery = z.infer<typeof ProductFilterSchema>;
