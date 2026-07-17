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

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Helpers
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
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

    const categoryId = crypto.randomUUID();
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
          const updatedDescPath = desc.path.replace(oldPath, newPath);
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
    return categories;
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

    return this.prisma.$transaction(async (tx) => {
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
          await tx.productImage.createMany({
            data: variantDto.images.map((img) => ({
              variantId: variant.id,
              url: img.url,
              isPrimary: img.isPrimary,
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
  }

  async updateProduct(id: string, sellerId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new HttpException('Product not found.', HttpStatus.NOT_FOUND);
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(
        'You are not authorized to update this product.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
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

      // 3. Reset and rebuild variants & SKUs
      if (dto.variants) {
        await tx.productVariant.deleteMany({
          where: { productId: id },
        });

        for (const variantDto of dto.variants) {
          const variant = await tx.productVariant.create({
            data: {
              productId: id,
              color: variantDto.color,
            },
          });

          if (variantDto.images && variantDto.images.length > 0) {
            await tx.productImage.createMany({
              data: variantDto.images.map((img) => ({
                variantId: variant.id,
                url: img.url,
                isPrimary: img.isPrimary,
              })),
            });
          }

          for (const skuDto of variantDto.skus) {
            await tx.sku.create({
              data: {
                variantId: variant.id,
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

    return product;
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
      // Nested relational sorting is resolved at DB layer via Raw SQL for Pagination
      // Retrieve product IDs sorted by minimum/maximum SKU price
      const direction = query.sort === 'PRICE_ASC' ? 'ASC' : 'DESC';
      const orderAgg = query.sort === 'PRICE_ASC' ? 'MIN' : 'MAX';

      // We extract raw WHERE conditions or perform simplified sorting
      // For clean E2E compatibility and robustness we execute the SQL:
      const rawProducts = await this.prisma.$queryRawUnsafe<
        Array<{ id: string }>
      >(
        `
        SELECT p.id, ${orderAgg}(s.price) as target_price
        FROM products p
        JOIN product_variants pv ON pv."productId" = p.id
        JOIN skus s ON s."variantId" = pv.id
        WHERE p.status = 'LIVE'
        GROUP BY p.id
        ORDER BY target_price ${direction}
        LIMIT $1 OFFSET $2
      `,
        limit,
        skip,
      );

      const ids = rawProducts.map((p) => p.id);
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

      // Maintain order returned by raw SQL
      const sortedProducts = ids
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p);

      const total = await this.prisma.product.count({ where });

      return {
        products: sortedProducts,
        total,
      };
    }

    if (query.sort === 'RECOMMENDED') {
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
      products,
      total,
    };
  }
}
