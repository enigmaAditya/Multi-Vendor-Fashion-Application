/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as net from 'net';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { IStorefrontClient, ISellerClient } from '@marketplace/types';

try {
  const envContent = fs.readFileSync(
    path.resolve(__dirname, '../.env'),
    'utf8',
  );
  for (const line of envContent.split('\n')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts
        .slice(1)
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  }
} catch {
  // Ignore if file doesn't exist
}

describe('Client Seam E2E System (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let sellerId: string;
  let sellerToken: string;
  let menswearId: string;
  let brandId: string;

  let storefrontClient: IStorefrontClient;
  let sellerClient: ISellerClient;

  beforeAll(async () => {
    // 1. Initialize NestJS App
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Start listening on a dynamic port
    await app.listen(0);
    const address = app.getHttpServer().address() as net.AddressInfo;
    const port = address.port;

    // 2. Point Web Client base URL to this dynamic port BEFORE importing modules
    process.env.NEXT_PUBLIC_API_URL = `http://localhost:${port}`;
    jest.resetModules();

    // 3. Import clients dynamically under CommonJS require so they pick up NEXT_PUBLIC_API_URL
    storefrontClient =
      require('../../web/app/lib/storefront-client') as IStorefrontClient;
    sellerClient = require('../../web/app/lib/seller-client') as ISellerClient;

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    sellerId = crypto.randomUUID();

    // Sign a seller session token
    sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clean up test DB tables
    await prisma.outboxEvent.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.subOrder.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.brand.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed test user
    await prisma.user.create({
      data: {
        id: sellerId,
        phone: '+919999999999',
        roles: ['SELLER'],
      },
    });

    // Seed initial category tree
    const menswear = await prisma.category.create({
      data: {
        name: 'Menswear',
        slug: 'menswear',
      },
    });
    menswearId = menswear.id;

    // Seed Brand
    const retro = await prisma.brand.create({
      data: {
        name: 'Retro Wear',
        slug: 'retro-wear',
      },
    });
    brandId = retro.id;
  });

  describe('Happy Path Client Integration', () => {
    it('should retrieve category tree using fetchCategories', async () => {
      const categories = await storefrontClient.fetchCategories();
      expect(categories).toBeInstanceOf(Array);
      expect(categories.length).toBeGreaterThanOrEqual(1);
      expect(categories[0].name).toBe('Menswear');
      expect(categories[0].slug).toBe('menswear');
    });

    it('should create a seller product draft and submit it for review', async () => {
      // 1. Create a product draft using seller-client
      const createRes = await sellerClient.createSellerProduct(sellerToken, {
        name: 'Fine Cotton Summer Tee',
        description: 'Lightweight linen cotton t-shirt',
        categoryId: menswearId,
        brandId: brandId,
        variants: [
          {
            color: 'Soft Beige',
            images: [{ url: 'https://img.com/beige.jpg', isPrimary: true }],
            skus: [
              {
                skuCode: 'TEE-BGE-M',
                size: 'M',
                price: 999,
                mrp: 1499,
              },
            ],
          },
        ],
      });

      expect(createRes.product.id).toBeDefined();
      expect(createRes.product.status).toBe('DRAFT');
      const productId = createRes.product.id;

      // 2. Submit the product draft for review
      const submitRes = await sellerClient.submitProductForReview(
        sellerToken,
        productId,
      );
      expect(submitRes.product.status).toBe('PENDING_REVIEW');

      // 3. Fetch product details via storefront-client using the slug and assert shape
      const slug = createRes.product.slug;
      const product = await storefrontClient.fetchProductBySlug(slug);

      expect(product).not.toBeNull();
      expect(product!.name).toBe('Fine Cotton Summer Tee');
      expect(product!.slug).toBe(slug);
      expect(product!.description).toBe('Lightweight linen cotton t-shirt');
      expect(product!.status).toBe('PENDING_REVIEW');
    });
  });

  describe('Seam Defenses & Zod Schema Validation', () => {
    it('should enforce MRP >= Price check server-side and reject creation if violated', async () => {
      await expect(
        sellerClient.createSellerProduct(sellerToken, {
          name: 'Invalid Price Tee',
          description: 'Pricing error',
          categoryId: menswearId,
          brandId: brandId,
          variants: [
            {
              color: 'Beige',
              images: [{ url: 'https://img.com/beige.jpg', isPrimary: true }],
              skus: [
                {
                  skuCode: 'TEE-OK-M',
                  size: 'M',
                  price: 1000,
                  mrp: 1500, // Valid
                },
                {
                  skuCode: 'TEE-ERR-L',
                  size: 'L',
                  price: 2000,
                  mrp: 1000, // VIOLATION: MRP < Price
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it('should throw Zod validation error when fetch returns a malformed response schema', async () => {
      const originalFetch = global.fetch;
      try {
        // Mock global.fetch to return a payload missing slug and description
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            product: {
              id: 'mock-id-123',
              name: 'Malformed Dress',
              // Missing slug and description which are required in ProductDetailSchema
              status: 'LIVE',
              createdAt: new Date().toISOString(),
            },
          }),
        });

        await expect(
          storefrontClient.fetchProductBySlug('some-slug'),
        ).rejects.toThrow();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
