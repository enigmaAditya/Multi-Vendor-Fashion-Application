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

describe('Inventory System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let sellerId: string;
  let adminId: string;
  let buyerId1: string;
  let buyerId2: string;
  let buyerId3: string;

  let sellerToken: string;
  let adminToken: string;
  let buyerToken1: string;
  let buyerToken2: string;
  let buyerToken3: string;

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
    buyerId1 = crypto.randomUUID();
    buyerId2 = crypto.randomUUID();
    buyerId3 = crypto.randomUUID();

    // Sign tokens
    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';
    sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'] },
      { secret, expiresIn: '15m' },
    );
    adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'] },
      { secret, expiresIn: '15m' },
    );
    buyerToken1 = await jwtService.signAsync(
      { sub: buyerId1, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
    buyerToken2 = await jwtService.signAsync(
      { sub: buyerId2, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
    buyerToken3 = await jwtService.signAsync(
      { sub: buyerId3, roles: ['USER'] },
      { secret, expiresIn: '15m' },
    );
  });

  beforeEach(async () => {
    // Clear databases in ordering order (Cascade deletes where possible or manually)
    await prisma.inventoryReservation.deleteMany({});
    await prisma.inventoryLedger.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed users
    await prisma.user.create({
      data: { id: sellerId, phone: '+919999999991', roles: ['SELLER'] },
    });
    await prisma.user.create({
      data: { id: adminId, phone: '+919999999992', roles: ['ADMIN'] },
    });
    await prisma.user.create({
      data: { id: buyerId1, phone: '+919999999993', roles: ['USER'] },
    });
    await prisma.user.create({
      data: { id: buyerId2, phone: '+919999999994', roles: ['USER'] },
    });
    await prisma.user.create({
      data: { id: buyerId3, phone: '+919999999995', roles: ['USER'] },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('should support warehouse creation, stock updates, user reservations, and atomic concurrency rules', async () => {
    // 1. Create a warehouse as Admin
    const warehouseRes = await request(app.getHttpServer())
      .post('/inventory/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Delhi Warehouse',
        code: 'DEL-01',
        address: 'Delhi Main Hub',
      })
      .expect(201);

    const warehouseId = warehouseRes.body.id;
    expect(warehouseId).toBeDefined();

    // 2. Setup Category, Product and SKU first
    const cat = await prisma.category.create({
      data: { name: 'Wear', slug: 'wear', path: 'wear' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Cotton Shirt',
        slug: 'cotton-shirt',
        sellerId,
        categoryId: cat.id,
      },
    });

    const variant = await prisma.productVariant.create({
      data: { productId: product.id, color: 'Blue' },
    });

    const sku = await prisma.sku.create({
      data: {
        variantId: variant.id,
        skuCode: 'CSHIRT-BLUE-M',
        sellerId,
        size: 'M',
        price: BigInt(8000),
        mrp: BigInt(12000),
      },
    });

    // 3. Add 1 unit of stock as Seller
    await request(app.getHttpServer())
      .post('/inventory/stock')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        skuId: sku.id,
        warehouseId,
        quantityDelta: 1,
        reason: 'Initial load',
      })
      .expect(201);

    // Verify stock is correctly updated in DB
    const currentInv = await prisma.skuInventory.findUnique({
      where: { warehouseId_skuId: { warehouseId, skuId: sku.id } },
    });
    expect(currentInv?.onHand).toBe(1);
    expect(currentInv?.reserved).toBe(0);

    // 4. Concurrency Test: 3 users concurrently try to reserve 1 unit of stock
    const payload1 = {
      skuId: sku.id,
      warehouseId,
      quantity: 1,
      reservationCode: 'RES-CODE-1',
    };
    const payload2 = {
      skuId: sku.id,
      warehouseId,
      quantity: 1,
      reservationCode: 'RES-CODE-2',
    };
    const payload3 = {
      skuId: sku.id,
      warehouseId,
      quantity: 1,
      reservationCode: 'RES-CODE-3',
    };

    const promises = [
      request(app.getHttpServer())
        .post('/inventory/reserve')
        .set('Authorization', `Bearer ${buyerToken1}`)
        .send(payload1),
      request(app.getHttpServer())
        .post('/inventory/reserve')
        .set('Authorization', `Bearer ${buyerToken2}`)
        .send(payload2),
      request(app.getHttpServer())
        .post('/inventory/reserve')
        .set('Authorization', `Bearer ${buyerToken3}`)
        .send(payload3),
    ];

    const results = await Promise.all(promises);

    const statuses = results.map((r) => r.status);
    const successRes = results.find((r) => r.status === 201);

    // Assert that exactly 1 request succeeded and the other 2 failed
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    expect(statuses.filter((s) => s === 400).length).toBe(2);

    // Verify final database state: reserved stock count is exactly 1
    const finalInv = await prisma.skuInventory.findUnique({
      where: { warehouseId_skuId: { warehouseId, skuId: sku.id } },
    });
    expect(finalInv?.onHand).toBe(1);
    expect(finalInv?.reserved).toBe(1);

    // Exactly one reservation row is saved as PENDING
    const reservationRows = await prisma.inventoryReservation.findMany({
      where: { skuId: sku.id },
    });
    expect(reservationRows.length).toBe(1);
    expect(reservationRows[0].status).toBe('PENDING');

    const successfulCode = reservationRows[0].reservationCode;
    const successfulUserToken =
      successfulCode === 'RES-CODE-1'
        ? buyerToken1
        : successfulCode === 'RES-CODE-2'
          ? buyerToken2
          : buyerToken3;

    // 5. Try to cancel (release) the active reservation
    await request(app.getHttpServer())
      .post('/inventory/release')
      .set('Authorization', `Bearer ${successfulUserToken}`)
      .send({ reservationCode: successfulCode })
      .expect(201);

    // Verify stock is restored and reservation status is flipped
    const restoredInv = await prisma.skuInventory.findUnique({
      where: { warehouseId_skuId: { warehouseId, skuId: sku.id } },
    });
    expect(restoredInv?.onHand).toBe(1);
    expect(restoredInv?.reserved).toBe(0);

    const restoredRes = await prisma.inventoryReservation.findUnique({
      where: { reservationCode: successfulCode },
    });
    expect(restoredRes?.status).toBe('RELEASED');
  });

  it('should block SKU deletion if active inventory exists', async () => {
    // Admin creates warehouse
    const warehouseRes = await request(app.getHttpServer())
      .post('/inventory/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Stock Warehouse', code: 'STOCK-01' })
      .expect(201);
    const warehouseId = warehouseRes.body.id;

    // Create SKU
    const cat = await prisma.category.create({
      data: { name: 'Wear', slug: 'wear', path: 'wear' },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Cotton Shirt',
        slug: 'cotton-shirt',
        sellerId,
        categoryId: cat.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, color: 'Blue' },
    });
    const sku = await prisma.sku.create({
      data: {
        variantId: variant.id,
        skuCode: 'CSHIRT-BLUE-M',
        sellerId,
        size: 'M',
        price: BigInt(8000),
        mrp: BigInt(12000),
      },
    });

    // Add stock
    await request(app.getHttpServer())
      .post('/inventory/stock')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ skuId: sku.id, warehouseId, quantityDelta: 1 })
      .expect(201);

    // Attempt to delete product or SKU via updateProduct endpoint
    // An update that removes this variant/SKU should be rejected by SKU deletion guard
    await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Updated Cotton Shirt',
        variants: [], // removing variant and SKU
      })
      .expect(400); // Bad Request (SKU has active stock)
  });
});
