import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

type App = Parameters<typeof request>[0];

describe('Systematic Authorization & IDOR Security Sweep (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let buyer1Id: string;
  let buyer2Id: string;
  let seller1Id: string;
  let seller2Id: string;

  let buyer1Token: string;
  let buyer2Token: string;
  let seller1Token: string;
  let seller2Token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    buyer1Id = crypto.randomUUID();
    buyer2Id = crypto.randomUUID();
    seller1Id = crypto.randomUUID();
    seller2Id = crypto.randomUUID();

    const secret = process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345';

    buyer1Token = await jwtService.signAsync({ sub: buyer1Id, roles: ['USER'] }, { secret, expiresIn: '15m' });
    buyer2Token = await jwtService.signAsync({ sub: buyer2Id, roles: ['USER'] }, { secret, expiresIn: '15m' });
    seller1Token = await jwtService.signAsync({ sub: seller1Id, roles: ['SELLER'] }, { secret, expiresIn: '15m' });
    seller2Token = await jwtService.signAsync({ sub: seller2Id, roles: ['SELLER'] }, { secret, expiresIn: '15m' });

    // Seed test users
    await prisma.user.createMany({
      data: [
        { id: buyer1Id, phone: `+91911${Math.floor(1000000 + Math.random() * 9000000)}`, roles: ['USER'] },
        { id: buyer2Id, phone: `+91912${Math.floor(1000000 + Math.random() * 9000000)}`, roles: ['USER'] },
        { id: seller1Id, phone: `+91913${Math.floor(1000000 + Math.random() * 9000000)}`, roles: ['SELLER'] },
        { id: seller2Id, phone: `+91914${Math.floor(1000000 + Math.random() * 9000000)}`, roles: ['SELLER'] },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Role Escalation Sweeps (Non-Admin -> Admin Routes)', () => {
    const mockUuid = crypto.randomUUID();
    const adminRoutes = [
      { method: 'get', path: '/admin/finance/summary' },
      { method: 'get', path: '/admin/sellers' },
      { method: 'patch', path: `/admin/sellers/${mockUuid}/kyc` },
      { method: 'get', path: '/admin/catalog/moderation-queue' },
      { method: 'patch', path: `/admin/catalog/products/${mockUuid}/status` },
      { method: 'patch', path: `/admin/reviews/${mockUuid}/moderate` },
      { method: 'post', path: '/admin/commissions' },
    ];

    adminRoutes.forEach((route) => {
      it(`should return 403 Forbidden for BUYER token on ${route.method.toUpperCase()} ${route.path}`, async () => {
        const req = (request(app.getHttpServer() as App) as any)[route.method](route.path);
        await req.set('Authorization', `Bearer ${buyer1Token}`).expect(403);
      });

      it(`should return 403 Forbidden for SELLER token on ${route.method.toUpperCase()} ${route.path}`, async () => {
        const req = (request(app.getHttpServer() as App) as any)[route.method](route.path);
        await req.set('Authorization', `Bearer ${seller1Token}`).expect(403);
      });
    });
  });

  describe('2. Buyer Cross-Account IDOR Sweeps', () => {
    it('should return 404 Not Found when Buyer 2 attempts to fetch Buyer 1 order (GET /orders/:id)', async () => {
      const order = await prisma.order.create({
        data: {
          buyerId: buyer1Id,
          gatewayOrderId: `order_idor_sweep_${crypto.randomUUID()}`,
          totalAmount: 5000n,
          discountAmount: 0n,
          amountCharged: 5000n,
          paymentStatus: 'PAID',
          shippingAddress: { city: 'Pune' },
        },
      });

      await request(app.getHttpServer() as App)
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${buyer2Token}`)
        .expect(404);
    });
  });

  describe('3. Seller Cross-Account IDOR Sweeps', () => {
    it('should return 403 Forbidden when Seller 2 attempts to dispatch Seller 1 sub-order', async () => {
      const orderId = crypto.randomUUID();
      const subOrderId = crypto.randomUUID();

      await prisma.order.create({
        data: {
          id: orderId,
          buyerId: buyer1Id,
          gatewayOrderId: `order_idor_sweep_${crypto.randomUUID()}`,
          totalAmount: 8000n,
          discountAmount: 0n,
          amountCharged: 8000n,
          paymentStatus: 'PAID',
          shippingAddress: { city: 'Bangalore' },
        },
      });

      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          orderId,
          sellerId: seller1Id,
          amount: 8000n,
          status: 'CONFIRMED',
          shipmentStatus: 'PENDING_SYNC',
        },
      });

      await request(app.getHttpServer() as App)
        .post(`/logistics/seller/sub-orders/${subOrderId}/dispatch`)
        .set('Authorization', `Bearer ${seller2Token}`)
        .expect(403);
    });
  });

  describe('4. Health Check Verification', () => {
    it('should return 200 OK and UP status for GET /health', async () => {
      const res = await request(app.getHttpServer() as App)
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('OK');
      expect(res.body.services.database).toBe('UP');
    });
  });
});
