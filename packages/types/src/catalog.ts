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

export const ImageInputSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url(),
  isPrimary: z.boolean().default(false),
  mediaId: z.string().uuid().optional().nullable(),
});

export const SkuInputSchema = z
  .object({
    id: z.string().uuid().optional(),
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
  id: z.string().uuid().optional(),
  color: z.string().min(1),
  images: z
    .array(ImageInputSchema)
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

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: CategoryNode[];
}

export const CategoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    parentId: z.string().nullable().optional(),
    children: z.array(CategoryNodeSchema).optional(),
  }),
);

export const SkuItemSchema = z.object({
  id: z.string(),
  skuCode: z.string(),
  price: z.union([z.string(), z.number()]).transform((val) => String(val)),
  attributes: z.record(z.string(), z.string()).optional().default({}),
  quantity: z.number().optional(),
});

export const ProductVariantSchema = z.object({
  id: z.string(),
  name: z.string().optional().default("Default Variant"),
  color: z.string().optional(),
  size: z.string().optional(),
  images: z
    .array(
      z.object({
        url: z.string(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
  skus: z.array(SkuItemSchema).optional(),
});

export const ProductDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  status: z.string(),
  createdAt: z.string(),
  category: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .optional(),
  brand: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .optional(),
  seller: z
    .object({
      id: z.string(),
      phone: z.string(),
    })
    .optional(),
  variants: z.array(ProductVariantSchema).optional(),
  averageRating: z.number().optional(),
  totalReviews: z.number().optional(),
});

export interface SkuItem {
  id: string;
  skuCode: string;
  price: string;
  attributes: Record<string, string>;
  quantity?: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  color?: string;
  size?: string;
  images?: Array<{ url: string; isPrimary?: boolean }>;
  skus?: SkuItem[];
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  createdAt: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  brand?: {
    id: string;
    name: string;
    slug: string;
  };
  seller?: {
    id: string;
    phone: string;
  };
  variants?: ProductVariant[];
  averageRating?: number;
  totalReviews?: number;
}

export interface SearchProductCard {
  id: string;
  name: string;
  slug: string;
  brandName?: string;
  categoryName?: string;
  pricePaise: string;
  imageUrl?: string;
  averageRating?: number;
  totalReviews?: number;
  inStock?: boolean;
}

export interface IStorefrontClient {
  fetchCategories(): Promise<CategoryNode[]>;
  fetchProductBySlug(slug: string): Promise<ProductDetail | null>;
}

export interface ISellerClient {
  createSellerProduct(token: string, payload: any): Promise<{ product: any }>;
  submitProductForReview(token: string, productId: string): Promise<{ product: any }>;
}
