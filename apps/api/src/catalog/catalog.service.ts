import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateCategoryDto,
  CreateBrandDto,
  CreateProductDto,
  UpdateProductDto,
  ProductFilterQuery,
} from '@marketplace/types';
import { PRODUCT_STATUS, ProductStatus } from '@marketplace/constants';
import * as crypto from 'crypto';
import { uuidv7 } from 'uuidv7';
import { SearchService } from '../search/search.service';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
  ) {}

  // Helpers
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }
  private serializeProduct<T>(product: T): T {
    if (!product) return product;
    const p = product as unknown as {
      variants?: Array<{
        skus?: Array<{
          price: bigint;
          mrp: bigint;
        }>;
      }>;
    };
    return {
      ...p,
      variants: p.variants?.map((v) => ({
        ...v,
        skus: v.skus?.map((s) => ({
          ...s,
          price: Number(s.price),
          mrp: Number(s.mrp),
        })),
      })),
    } as unknown as T;
  }
  // --- Category ---
  async createCategory(dto: CreateCategoryDto) {
    const slug = dto.slug || this.generateSlug(dto.name);

    // Validate parent exists if parentId provided
    let parentPath = '';
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found.');
      }
      parentPath = parent.path;
    }

    const categoryId = uuidv7();
    const path = parentPath ? `${parentPath}/${categoryId}` : categoryId;

    return this.prisma.category.create({
      data: {
        id: categoryId,
        name: dto.name,
        slug,
        parentId: dto.parentId,
        path,
      },
    });
  }

  async updateCategory(
    id: string,
    dto: { name?: string; slug?: string; parentId?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUniqueOrThrow({ where: { id } });
      const oldPath = category.path;

      const newParentId = dto.parentId;
      let newPath = category.path;

      if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
        if (dto.parentId === id) {
          throw new BadRequestException('Category cannot be its own parent.');
        }

        let parentPath = '';
        if (dto.parentId) {
          const parent = await tx.category.findUniqueOrThrow({
            where: { id: dto.parentId },
          });
          // Prevent cycle
          if (parent.path.startsWith(`${oldPath}/`) || parent.id === id) {
            throw new BadRequestException('Cannot set parent to a descendant.');
          }
          parentPath = parent.path;
        }
        newPath = parentPath ? `${parentPath}/${id}` : id;
      }

      const updated = await tx.category.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          parentId: newParentId,
          path: newPath,
        },
      });

      // Update descendant paths recursively if path prefix changed
      if (newPath !== oldPath) {
        const descendants = await tx.category.findMany({
          where: {
            path: { startsWith: `${oldPath}/` },
          },
        });

        for (const desc of descendants) {
          const updatedDescPath = `${newPath}${desc.path.slice(oldPath.length)}`;
          await tx.category.update({
            where: { id: desc.id },
            data: { path: updatedDescPath },
          });
        }
      }

      return updated;
    });
  }

  async getCategoriesTree() {
    const categories = await this.prisma.category.findMany({
      orderBy: { path: 'asc' },
    });

    type CategoryWithChildren = (typeof categories)[number] & {
      children: CategoryWithChildren[];
    };

    const categoryMap = new Map<string, CategoryWithChildren>();
    categories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    const tree: CategoryWithChildren[] = [];
    categories.forEach((cat) => {
      const node = categoryMap.get(cat.id);
      if (node) {
        if (cat.parentId && categoryMap.has(cat.parentId)) {
          categoryMap.get(cat.parentId)?.children.push(node);
        } else {
          tree.push(node);
        }
      }
    });

    return tree;
  }

  // --- Brand ---
  async createBrand(dto: CreateBrandDto) {
    const slug = dto.slug || this.generateSlug(dto.name);
    return this.prisma.brand.create({
      data: {
        name: dto.name,
        slug,
      },
    });
  }

  async getBrands() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // --- Product Mutations ---
  async createProduct(sellerId: string, dto: CreateProductDto) {
    const slug = dto.slug || this.generateSlug(dto.name);

    // Collect and validate media IDs
    const incomingMediaIds: string[] = [];
    for (const variantDto of dto.variants) {
      for (const imgDto of variantDto.images) {
        if (imgDto.mediaId) {
          incomingMediaIds.push(imgDto.mediaId);
        }
      }
    }

    if (incomingMediaIds.length > 0) {
      const mediaRecords = await this.prisma.media.findMany({
        where: {
          id: { in: incomingMediaIds },
        },
      });

      const mediaMap = new Map(mediaRecords.map((m) => [m.id, m]));
      for (const mediaId of incomingMediaIds) {
        const media = mediaMap.get(mediaId);
        if (!media) {
          throw new BadRequestException(`Media record ${mediaId} not found.`);
        }
        if (media.status !== 'PROCESSED') {
          throw new BadRequestException(
            `Media record ${mediaId} has status ${media.status} instead of PROCESSED.`,
          );
        }
        if (media.userId !== sellerId) {
          throw new BadRequestException(
            `You do not own the media record ${mediaId}.`,
          );
        }
      }
    }

    // Enforce MRP >= Price invariant check on all SKUs
    for (const variant of dto.variants || []) {
      for (const sku of variant.skus || []) {
        if (sku.mrp < sku.price) {
          throw new BadRequestException(
            `Validation failed: SKU ${sku.skuCode} MRP (${sku.mrp}) cannot be less than price (${sku.price})`,
          );
        }
      }
    }

    // Dynamic checks
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Category not found.');
      }
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({
        where: { id: dto.brandId },
      });
      if (!brand) {
        throw new BadRequestException('Brand not found.');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create product
      const product = await tx.product.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          status: PRODUCT_STATUS.DRAFT,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          sellerId,
          sizeChartId: dto.sizeChartId,
        },
      });

      // 2. Add attribute mapping
      if (dto.attributes && dto.attributes.length > 0) {
        await tx.productAttributeValueMap.createMany({
          data: dto.attributes.map((valId) => ({
            productId: product.id,
            attributeValueId: valId,
          })),
        });
      }

      // 3. Create variants & SKUs
      for (const variantDto of dto.variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            color: variantDto.color,
          },
        });

        // Create images
        if (variantDto.images && variantDto.images.length > 0) {
          const primaryCount = variantDto.images.filter(
            (img) => img.isPrimary,
          ).length;
          if (primaryCount === 0) {
            variantDto.images[0].isPrimary = true;
          } else if (primaryCount > 1) {
            let foundPrimary = false;
            for (const img of variantDto.images) {
              if (img.isPrimary) {
                if (foundPrimary) {
                  img.isPrimary = false;
                } else {
                  foundPrimary = true;
                }
              }
            }
          }

          await tx.productImage.createMany({
            data: variantDto.images.map((img) => ({
              variantId: variant.id,
              url: img.url,
              isPrimary: img.isPrimary,
              mediaId: img.mediaId || null,
            })),
          });
        }

        // Create SKUs
        for (const skuDto of variantDto.skus) {
          await tx.sku.create({
            data: {
              variantId: variant.id,
              skuCode: skuDto.skuCode,
              sellerId, // Owner consistency assertion
              size: skuDto.size,
              price: BigInt(skuDto.price),
              mrp: BigInt(skuDto.mrp),
            },
          });
        }
      }

      // 4. Save to outbox
      await tx.outboxEvent.create({
        data: {
          eventType: 'product.created',
          payload: {
            productId: product.id,
            sellerId,
          },
        },
      });

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          brand: true,
          variants: {
            include: {
              images: true,
              skus: true,
            },
          },
          attributes: {
            include: {
              attributeValue: {
                include: {
                  attribute: true,
                },
              },
            },
          },
        },
      });
    });

    return this.serializeProduct(result);
  }

  async updateProduct(id: string, sellerId: string, dto: UpdateProductDto) {
    // Collect and validate media IDs (N+1 validation check - batched)
    const incomingMediaIds: string[] = [];
    if (dto.variants) {
      for (const variantDto of dto.variants) {
        for (const imgDto of variantDto.images) {
          if (imgDto.mediaId) {
            incomingMediaIds.push(imgDto.mediaId);
          }
        }
      }
    }

    if (incomingMediaIds.length > 0) {
      const mediaRecords = await this.prisma.media.findMany({
        where: {
          id: { in: incomingMediaIds },
        },
      });

      const mediaMap = new Map(mediaRecords.map((m) => [m.id, m]));
      for (const mediaId of incomingMediaIds) {
        const media = mediaMap.get(mediaId);
        if (!media) {
          throw new BadRequestException(`Media record ${mediaId} not found.`);
        }
        if (media.status !== 'PROCESSED') {
          throw new BadRequestException(
            `Media record ${mediaId} has status ${media.status} instead of PROCESSED.`,
          );
        }
        if (media.userId !== sellerId) {
          throw new BadRequestException(
            `You do not own the media record ${mediaId}.`,
          );
        }
      }
    }

    // Enforce MRP >= Price invariant check on all SKUs
    for (const variant of dto.variants || []) {
      for (const sku of variant.skus || []) {
        if (sku.mrp < sku.price) {
          throw new BadRequestException(
            `Validation failed: SKU ${sku.skuCode} MRP (${sku.mrp}) cannot be less than price (${sku.price})`,
          );
        }
      }
    }

    // Dynamic checks
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Category not found.');
      }
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({
        where: { id: dto.brandId },
      });
      if (!brand) {
        throw new BadRequestException('Brand not found.');
      }
    }

    // Fetch existing product status to run ID checks
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            images: true,
            skus: true,
          },
        },
      },
    });

    if (!product) {
      throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(
        'You are not authorized to update this product.',
      );
    }

    // Cross-product hijacking validations
    const currentVariantIds = new Set(product.variants.map((v) => v.id));
    const currentImageIds = new Set(
      product.variants.flatMap((v) => v.images.map((img) => img.id)),
    );

    if (dto.variants) {
      for (const variantDto of dto.variants) {
        if (variantDto.id && !currentVariantIds.has(variantDto.id)) {
          throw new BadRequestException(
            `Variant ID ${variantDto.id} does not belong to this product.`,
          );
        }
        for (const imgDto of variantDto.images) {
          if (imgDto.id && !currentImageIds.has(imgDto.id)) {
            throw new BadRequestException(
              `Image ID ${imgDto.id} does not belong to this product.`,
            );
          }
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update basic info
      const slug =
        dto.slug || (dto.name ? this.generateSlug(dto.name) : undefined);
      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          sizeChartId: dto.sizeChartId,
        },
      });

      // 2. Reset and rebuild attributes
      if (dto.attributes) {
        await tx.productAttributeValueMap.deleteMany({
          where: { productId: id },
        });

        if (dto.attributes.length > 0) {
          await tx.productAttributeValueMap.createMany({
            data: dto.attributes.map((valId) => ({
              productId: id,
              attributeValueId: valId,
            })),
          });
        }
      }

      // 3. Diff and upsert variants, images, and SKUs
      if (dto.variants) {
        const incomingVariantIds = new Set(
          dto.variants.map((v) => v.id).filter(Boolean) as string[],
        );

        // A. DELETE operations first (Ordering constraint to prevent SKU unique code collision)
        const removedVariantIds = product.variants
          .map((v) => v.id)
          .filter((vid) => !incomingVariantIds.has(vid));

        const imagesToDelete: string[] = [];
        const skusToDelete: string[] = [];

        for (const variantDto of dto.variants) {
          if (variantDto.id) {
            const existingVariant = product.variants.find(
              (v) => v.id === variantDto.id,
            );
            if (existingVariant) {
              const incomingImgIds = new Set(
                variantDto.images
                  .map((img) => img.id)
                  .filter(Boolean) as string[],
              );
              const incomingSkuCodes = new Set(
                variantDto.skus.map((sku) => sku.skuCode),
              );

              existingVariant.images.forEach((img) => {
                if (!incomingImgIds.has(img.id)) {
                  imagesToDelete.push(img.id);
                }
              });

              existingVariant.skus.forEach((sku) => {
                if (!incomingSkuCodes.has(sku.skuCode)) {
                  skusToDelete.push(sku.id);
                }
              });
            }
          }
        }

        // Verify SKU deletion safety (Note 3 / 6)
        const allSkusToDelete = [...skusToDelete];
        if (removedVariantIds.length > 0) {
          const removedVariantSkus = product.variants
            .filter((v) => removedVariantIds.includes(v.id))
            .flatMap((v) => v.skus.map((s) => s.id));
          allSkusToDelete.push(...removedVariantSkus);
        }

        if (allSkusToDelete.length > 0) {
          const linkedInventory = await tx.skuInventory.count({
            where: { skuId: { in: allSkusToDelete } },
          });
          const linkedReservations = await tx.inventoryReservation.count({
            where: { skuId: { in: allSkusToDelete } },
          });
          const linkedLedgers = await tx.inventoryLedger.count({
            where: { skuId: { in: allSkusToDelete } },
          });

          if (
            linkedInventory > 0 ||
            linkedReservations > 0 ||
            linkedLedgers > 0
          ) {
            throw new BadRequestException(
              'Cannot delete SKUs that have active stock records or reservations. Please adjust stock first.',
            );
          }
        }

        // Execute DB deletes (ordering: children first then parents)
        if (skusToDelete.length > 0) {
          await tx.sku.deleteMany({
            where: { id: { in: skusToDelete } },
          });
        }
        if (imagesToDelete.length > 0) {
          await tx.productImage.deleteMany({
            where: { id: { in: imagesToDelete } },
          });
        }
        if (removedVariantIds.length > 0) {
          await tx.productVariant.deleteMany({
            where: { id: { in: removedVariantIds } },
          });
        }

        // B. UPDATE & CREATE operations
        for (const variantDto of dto.variants) {
          let variantId = variantDto.id;

          // Normalize primary images to exactly one (Note 4)
          const primaryCount = variantDto.images.filter(
            (img) => img.isPrimary,
          ).length;
          if (primaryCount === 0 && variantDto.images.length > 0) {
            variantDto.images[0].isPrimary = true;
          } else if (primaryCount > 1) {
            let foundPrimary = false;
            for (const img of variantDto.images) {
              if (img.isPrimary) {
                if (foundPrimary) {
                  img.isPrimary = false;
                } else {
                  foundPrimary = true;
                }
              }
            }
          }

          if (variantId) {
            // Match variant -> Update
            await tx.productVariant.update({
              where: { id: variantId },
              data: { color: variantDto.color },
            });

            const existingVariant = product.variants.find(
              (v) => v.id === variantId,
            )!;

            // Upsert child images
            for (const imgDto of variantDto.images) {
              if (imgDto.id) {
                await tx.productImage.update({
                  where: { id: imgDto.id },
                  data: {
                    url: imgDto.url,
                    isPrimary: imgDto.isPrimary,
                    mediaId: imgDto.mediaId || null,
                  },
                });
              } else {
                await tx.productImage.create({
                  data: {
                    variantId,
                    url: imgDto.url,
                    isPrimary: imgDto.isPrimary,
                    mediaId: imgDto.mediaId || null,
                  },
                });
              }
            }

            // Upsert child SKUs
            for (const skuDto of variantDto.skus) {
              const existingSku = existingVariant.skus.find(
                (s) => s.skuCode === skuDto.skuCode,
              );

              if (existingSku) {
                await tx.sku.update({
                  where: { id: existingSku.id },
                  data: {
                    size: skuDto.size,
                    price: BigInt(skuDto.price),
                    mrp: BigInt(skuDto.mrp),
                  },
                });
              } else {
                await tx.sku.create({
                  data: {
                    variantId,
                    skuCode: skuDto.skuCode,
                    sellerId,
                    size: skuDto.size,
                    price: BigInt(skuDto.price),
                    mrp: BigInt(skuDto.mrp),
                  },
                });
              }
            }
          } else {
            // New variant -> Create variant + all children
            const variant = await tx.productVariant.create({
              data: {
                productId: id,
                color: variantDto.color,
              },
            });
            variantId = variant.id;

            for (const imgDto of variantDto.images) {
              await tx.productImage.create({
                data: {
                  variantId,
                  url: imgDto.url,
                  isPrimary: imgDto.isPrimary,
                  mediaId: imgDto.mediaId || null,
                },
              });
            }

            for (const skuDto of variantDto.skus) {
              await tx.sku.create({
                data: {
                  variantId,
                  skuCode: skuDto.skuCode,
                  sellerId,
                  size: skuDto.size,
                  price: BigInt(skuDto.price),
                  mrp: BigInt(skuDto.mrp),
                },
              });
            }
          }
        }
      }

      // 4. Save to outbox
      await tx.outboxEvent.create({
        data: {
          eventType: 'product.updated',
          payload: {
            productId: id,
            sellerId,
          },
        },
      });

      return tx.product.findUnique({
        where: { id },
        include: {
          category: true,
          brand: true,
          variants: {
            include: {
              images: true,
              skus: true,
            },
          },
          attributes: {
            include: {
              attributeValue: {
                include: {
                  attribute: true,
                },
              },
            },
          },
        },
      });
    });

    return this.serializeProduct(result);
  }

  // --- Product Status Transitions ---
  async transitionProductStatus(
    id: string,
    action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SUSPEND',
    roles: string[],
    sellerId?: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    }

    const currentStatus = product.status as ProductStatus;
    let nextStatus: ProductStatus;

    if (action === 'SUBMIT') {
      if (sellerId && product.sellerId !== sellerId) {
        throw new ForbiddenException(
          'You are not authorized to submit this product.',
        );
      }

      if (
        currentStatus !== PRODUCT_STATUS.DRAFT &&
        currentStatus !== PRODUCT_STATUS.REJECTED
      ) {
        throw new BadRequestException(
          `Invalid transition from status ${currentStatus} via SUBMIT.`,
        );
      }

      // Draft Completeness Gate
      if (!product.description || !product.categoryId || !product.brandId) {
        throw new BadRequestException(
          'Cannot submit incomplete product draft. Description, Category, and Brand must be set.',
        );
      }

      nextStatus = PRODUCT_STATUS.PENDING_REVIEW;
    } else {
      // Approve/Reject/Suspend are admin only actions
      if (!roles.includes('ADMIN')) {
        throw new ForbiddenException(
          'Only admins are authorized to moderate products.',
        );
      }

      if (action === 'APPROVE') {
        if (currentStatus !== PRODUCT_STATUS.PENDING_REVIEW) {
          throw new BadRequestException(
            `Invalid transition from status ${currentStatus} via APPROVE.`,
          );
        }
        nextStatus = PRODUCT_STATUS.LIVE;
      } else if (action === 'REJECT') {
        if (currentStatus !== PRODUCT_STATUS.PENDING_REVIEW) {
          throw new BadRequestException(
            `Invalid transition from status ${currentStatus} via REJECT.`,
          );
        }
        nextStatus = PRODUCT_STATUS.REJECTED;
      } else if (action === 'SUSPEND') {
        if (currentStatus !== PRODUCT_STATUS.LIVE) {
          throw new BadRequestException(
            `Invalid transition from status ${currentStatus} via SUSPEND.`,
          );
        }
        nextStatus = PRODUCT_STATUS.SUSPENDED;
      } else {
        throw new BadRequestException(
          `Unknown moderation action: ${action as string}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { status: nextStatus },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'product.status_changed',
          payload: {
            productId: id,
            oldStatus: currentStatus,
            newStatus: nextStatus,
          },
        },
      });

      return updated;
    });
  }

  // --- Product Queries ---
  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        brand: true,
        variants: {
          include: {
            images: true,
            skus: true,
          },
        },
        attributes: {
          include: {
            attributeValue: {
              include: {
                attribute: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    }

    return this.serializeProduct(product);
  }

  async getProducts(query: ProductFilterQuery) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      status: PRODUCT_STATUS.LIVE, // Public query gets LIVE products
    };

    // Category nested materialized path filter
    if (query.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: query.categoryId },
      });
      if (category) {
        const descendantCategories = await this.prisma.category.findMany({
          where: {
            OR: [
              { id: query.categoryId },
              { path: { startsWith: `${category.path}/` } },
            ],
          },
        });
        where.categoryId = {
          in: descendantCategories.map((c) => c.id),
        };
      }
    }

    // Brand filter
    if (query.brandId) {
      where.brandId = query.brandId;
    }

    // Price range filters
    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      const priceFilter: Prisma.BigIntFilter = {};
      if (query.priceMin !== undefined) {
        priceFilter.gte = BigInt(query.priceMin);
      }
      if (query.priceMax !== undefined) {
        priceFilter.lte = BigInt(query.priceMax);
      }

      where.variants = {
        some: {
          skus: {
            some: {
              price: priceFilter,
            },
          },
        },
      };
    }

    // Attributes (AND search)
    if (query.attributes && query.attributes.length > 0) {
      where.AND = query.attributes.map((attrValId) => ({
        attributes: {
          some: {
            attributeValueId: attrValId,
          },
        },
      }));
    }

    // Sorting
    let orderBy: Prisma.ProductOrderByWithRelationInput = {
      createdAt: 'desc',
    }; // Default is NEWEST
    if (query.sort === 'PRICE_ASC' || query.sort === 'PRICE_DESC') {
      const meiliResult = await this.searchService.search({
        categoryId: query.categoryId,
        brandId: query.brandId,
        minPrice: query.priceMin,
        maxPrice: query.priceMax,
        sort: query.sort === 'PRICE_ASC' ? 'price_asc' : 'price_desc',
        limit,
        offset: skip,
      });

      const ids = meiliResult.hits.map((h) => h.id);
      if (ids.length === 0) {
        return {
          products: [],
          total: 0,
        };
      }

      const products = await this.prisma.product.findMany({
        where: {
          id: { in: ids },
        },
        include: {
          category: true,
          brand: true,
          variants: {
            include: {
              images: true,
              skus: true,
            },
          },
          attributes: {
            include: {
              attributeValue: {
                include: {
                  attribute: true,
                },
              },
            },
          },
        },
      });

      // Maintain order returned by Meilisearch
      const sortedProducts = ids
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is (typeof products)[number] => !!p);

      const total = meiliResult.estimatedTotalHits ?? meiliResult.hits.length;

      return {
        products: sortedProducts.map((p) => this.serializeProduct(p)),
        total,
      };
    }

    if (query.sort === 'RECOMMENDED') {
      // TODO: real ranking in P8
      orderBy = { name: 'asc' };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        take: limit,
        skip,
        include: {
          category: true,
          brand: true,
          variants: {
            include: {
              images: true,
              skus: true,
            },
          },
          attributes: {
            include: {
              attributeValue: {
                include: {
                  attribute: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      products: products.map((p) => this.serializeProduct(p)),
      total,
    };
  }
}
