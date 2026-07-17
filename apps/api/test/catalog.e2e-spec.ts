import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Catalog System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let sellerId: string;
  let adminId: string;
  let sellerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    sellerId = crypto.randomUUID();
    adminId = crypto.randomUUID();

    // Sign tokens
    sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
    adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
  });

  beforeEach(async () => {
    // Clear databases
    await prisma.inventoryReservation.deleteMany({});
    await prisma.inventoryLedger.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.productAttributeValueMap.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.brand.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed users
    await prisma.user.create({
      data: {
        id: sellerId,
        phone: '+919999999999',
        roles: ['SELLER'],
      },
    });

    await prisma.user.create({
      data: {
        id: adminId,
        phone: '+918888888888',
        roles: ['ADMIN'],
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('should verify complete category hierarchy, drafts, completeness checks, and admin moderation states', async () => {
    // 1. Categories creation
    const apparelId = crypto.randomUUID();
    const menswearId = crypto.randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.category.create({
        data: {
          id: apparelId,
          name: 'Apparel',
          slug: 'apparel',
          path: apparelId,
        },
      });

      await tx.category.create({
        data: {
          id: menswearId,
          name: 'Menswear',
          slug: 'menswear',
          parentId: apparelId,
          path: `${apparelId}/${menswearId}`,
        },
      });
    });

    const brand = await prisma.brand.create({
      data: {
        name: 'Ivy & Stone',
        slug: 'ivy-stone',
      },
    });

    // 2. Fetch categories tree
    await request(app.getHttpServer())
      .get('/categories/tree')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          categories: Array<{ id: string; name: string }>;
        };
        expect(body.categories.length).toBe(2);
        expect(body.categories.find((c) => c.id === menswearId)).toBeDefined();
      });

    // 3. Create initial product draft (missing description)
    let productId = '';
    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Cotton Polo Shirt',
        categoryId: menswearId,
        brandId: brand.id,
        description: null,
        variants: [
          {
            color: 'Navy Blue',
            images: [{ url: 'https://img.com/navy.jpg', isPrimary: true }],
            skus: [
              { skuCode: 'POLO-NAVY-M', size: 'M', price: 1499, mrp: 1999 },
            ],
          },
        ],
      })
      .expect(201)
      .expect((res) => {
        const body = res.body as { product: { id: string; status: string } };
        productId = body.product.id;
        expect(body.product.status).toBe('DRAFT');
      });

    // 4. Try submitting incomplete draft (description is null) -> should fail
    await request(app.getHttpServer())
      .post(`/products/${productId}/submit`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(400)
      .expect((res) => {
        const body = res.body as { message?: string };
        expect(body.message).toContain('incomplete product draft');
      });

    // 5. Update product with complete fields
    await request(app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        description: 'Super comfortable polo shirt made of organic cotton.',
      })
      .expect(200);

    // 6. Submit complete product for review -> succeeds
    await request(app.getHttpServer())
      .post(`/products/${productId}/submit`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as { product: { status: string } };
        expect(body.product.status).toBe('PENDING_REVIEW');
      });

    // 7. Modifying a pending review product from a different seller -> fails (auth check)
    const otherSellerToken = await jwtService.signAsync(
      { sub: 'different-seller-uuid', roles: ['SELLER'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
    await request(app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Authorization', `Bearer ${otherSellerToken}`)
      .send({ name: 'Hack Name' })
      .expect(403);

    // 8. Admin moderate -> reject
    await request(app.getHttpServer())
      .post(`/products/${productId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'REJECT', reason: 'Poor image quality' })
      .expect(200)
      .expect((res) => {
        const body = res.body as { product: { status: string } };
        expect(body.product.status).toBe('REJECTED');
      });

    // 9. Re-submit and approve
    await request(app.getHttpServer())
      .post(`/products/${productId}/submit`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/products/${productId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' })
      .expect(200)
      .expect((res) => {
        const body = res.body as { product: { status: string } };
        expect(body.product.status).toBe('LIVE');
      });

    // 10. Query products publicly (only LIVE should appear)
    await request(app.getHttpServer())
      .get('/products')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          products: Array<{ id: string }>;
          total: number;
        };
        expect(body.total).toBe(1);
        expect(body.products[0].id).toBe(productId);
      });
  });
});
