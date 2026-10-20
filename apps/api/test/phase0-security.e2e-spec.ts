import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { once } from 'events';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { requireEnv } from '../src/common/env.helper';
import cookieParser from 'cookie-parser';

describe('Phase 0 Security & Validation Invariants (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let authService: AuthService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    redis = app.get<RedisService>(RedisService);
    authService = app.get<AuthService>(AuthService);
    jwtService = app.get<JwtService>(JwtService);
  });

  beforeEach(async () => {
    await prisma.commissionLedger.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.sellerLinkedAccount.deleteMany({});
    await prisma.commissionRule.deleteMany({});
    await prisma.paymentWebhookLog.deleteMany({});
    await prisma.shipmentWebhookLog.deleteMany({});
    await prisma.userProductView.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.subOrder.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryReservation.deleteMany({});
    await prisma.inventoryLedger.deleteMany({});
    await prisma.skuInventory.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.brand.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.otpRequest.deleteMany({});
    await prisma.user.deleteMany({});

    await redis.getClient().flushall();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('1. otp/verify with code 123456 and no prior OTP request -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: '+919876543210',
        code: '123456',
      });

    expect(res.status).toBe(400);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('2. otp/request with phone "hello" -> 400, and "9111111111" and "+919111111111" resolve to the SAME user', async () => {
    // 2a. Invalid phone format -> 400
    const invalidRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: 'hello' });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.errors).toBeDefined();

    // 2b. Request OTP with bare 10-digit phone
    await redis.getClient().flushall();
    process.env.DEMO_MODE = 'true';

    const req1 = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '9111111111' });

    expect(req1.status).toBe(200);
    const otp1 = req1.body.demoOtp;
    expect(otp1).toBeDefined();

    // Verify OTP with bare 10-digit number
    const verify1 = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: '9111111111', code: otp1 });

    expect(verify1.status).toBe(200);
    const userId1 = verify1.body.user.id;
    expect(verify1.body.user.phone).toBe('+919111111111');

    // Now request OTP with +919111111111
    await redis.getClient().flushall();
    const req2 = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '+919111111111' });

    expect(req2.status).toBe(200);
    const otp2 = req2.body.demoOtp;
    expect(otp2).toBeDefined();

    // Verify OTP with +91 prefix
    const verify2 = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: '+919111111111', code: otp2 });

    expect(verify2.status).toBe(200);
    const userId2 = verify2.body.user.id;

    // Both MUST resolve to the exact same user ID in the database
    expect(userId1).toBe(userId2);
  });

  it('3. DEMO_MODE=true: buyer gets demoOtp and verifying with it succeeds; admin gets NO demoOtp. DEMO_MODE=false: no demoOtp field at all', async () => {
    // Case A: DEMO_MODE=true
    process.env.DEMO_MODE = 'true';
    await redis.getClient().flushall();

    // Non-admin buyer request
    const buyerPhone = '+919111111112';
    const buyerReq = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: buyerPhone });

    expect(buyerReq.status).toBe(200);
    expect(buyerReq.body.demoOtp).toBeDefined();
    expect(buyerReq.body.demoOtp).toMatch(/^\d{6}$/);

    // Verify with demoOtp succeeds
    const buyerVerify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: buyerPhone, code: buyerReq.body.demoOtp });
    expect(buyerVerify.status).toBe(200);
    expect(buyerVerify.body.accessToken).toBeDefined();

    // Create Admin user
    const adminPhone = '+919000000099';
    await prisma.user.create({
      data: {
        phone: adminPhone,
        roles: ['ADMIN', 'USER'],
        tokenVersion: 0,
      },
    });

    await redis.getClient().flushall();
    const adminReq = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: adminPhone });

    expect(adminReq.status).toBe(200);
    expect(adminReq.body.demoOtp).toBeUndefined();

    // Case B: DEMO_MODE=false
    process.env.DEMO_MODE = 'false';
    await redis.getClient().flushall();

    const normalReq = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '+919111111114' });

    expect(normalReq.status).toBe(200);
    expect(normalReq.body.demoOtp).toBeUndefined();
  });

  it('4. GET /products?categoryId=notauuid -> 400 with an errors array', async () => {
    const res = await request(app.getHttpServer())
      .get('/products')
      .query({ categoryId: 'notauuid' });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].path).toBe('categoryId');
  });

  it('5. PATCH /admin/sellers/xyz/kyc with {} -> 400', async () => {
    const adminId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: adminId,
        phone: '+919000000005',
        roles: ['ADMIN'],
        tokenVersion: 0,
      },
    });

    const adminToken = await jwtService.signAsync(
      { sub: adminId, roles: ['ADMIN'], token_version: 0 },
      { secret: requireEnv('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );

    const res = await request(app.getHttpServer())
      .patch('/admin/sellers/xyz/kyc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('6. Duplicate skuCode on product create -> 409', async () => {
    const sellerId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: sellerId,
        phone: '+919000000006',
        roles: ['SELLER'],
        tokenVersion: 0,
      },
    });

    const category = await prisma.category.create({
      data: {
        id: crypto.randomUUID(),
        name: 'Test Cat',
        slug: 'test-cat-' + crypto.randomUUID().slice(0, 8),
        path: 'test-cat',
      },
    });

    const brand = await prisma.brand.create({
      data: {
        id: crypto.randomUUID(),
        name: 'Test Brand',
        slug: 'test-brand-' + crypto.randomUUID().slice(0, 8),
      },
    });

    const sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'], token_version: 0 },
      { secret: requireEnv('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );

    const duplicateSku = 'PHASE0-SKU-DUP-1';

    // 1st product creation
    const res1 = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Product A',
        categoryId: category.id,
        brandId: brand.id,
        description: null,
        variants: [
          {
            color: 'Black',
            images: [{ url: 'https://img.com/a.jpg', isPrimary: true }],
            skus: [
              { skuCode: duplicateSku, size: 'M', price: 1000, mrp: 1200 },
            ],
          },
        ],
      });

    expect(res1.status).toBe(201);

    // 2nd product creation with identical SKU code -> MUST return 409
    const res2 = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Product B',
        categoryId: category.id,
        brandId: brand.id,
        description: null,
        variants: [
          {
            color: 'White',
            images: [{ url: 'https://img.com/b.jpg', isPrimary: true }],
            skus: [
              { skuCode: duplicateSku, size: 'L', price: 1500, mrp: 1800 },
            ],
          },
        ],
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('Conflict');
  });

  it('7. After logout-all, a previously issued access token -> 401', async () => {
    const userId = crypto.randomUUID();
    const user = await prisma.user.create({
      data: {
        id: userId,
        phone: '+919000000007',
        roles: ['USER'],
        tokenVersion: 0,
      },
    });

    const tokens = await authService.issueTokens(user);

    // Live access token succeeds
    const resBefore = await request(app.getHttpServer())
      .get('/recommendations/recently-viewed')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(resBefore.status).toBe(200);

    // Invalidate all sessions
    await authService.logoutAll(userId);

    // Same previously issued access token MUST be rejected with 401
    const resAfter = await request(app.getHttpServer())
      .get('/recommendations/recently-viewed')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(resAfter.status).toBe(401);
    expect(resAfter.body.message).toContain('revoked');
  });

  it('8. Booting without JWT_ACCESS_SECRET -> process exits with the requireEnv error', async () => {
    const mainJsPath = path.resolve(__dirname, '../dist/main.js');
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://dev:dev@localhost:5432/marketplace_test',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      DOTENV_CONFIG_PATH: '/dev/null',
    };
    delete childEnv.JWT_ACCESS_SECRET;

    const child = spawn(process.execPath, [mainJsPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const [exitCode] = await once(child, 'exit');
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(
      'Environment variable "JWT_ACCESS_SECRET" is required',
    );
  });
});
