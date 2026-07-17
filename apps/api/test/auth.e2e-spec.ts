import * as fs from 'fs';
import * as path from 'path';

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
import { RedisService } from '../src/redis/redis.service';
import cookieParser from 'cookie-parser';

describe('Auth System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    redis = app.get<RedisService>(RedisService);
  });

  beforeEach(async () => {
    // Clear databases before each test to ensure isolation
    await prisma.refreshToken.deleteMany({});
    await prisma.otpRequest.deleteMany({});
    await prisma.oAuthAccount.deleteMany({});
    await prisma.user.deleteMany({});

    // Flush Redis to clear throttle flags
    await redis.getClient().flushall();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('should go through the complete auth lifecycle (request OTP -> verify -> refresh -> reuse detection -> logout)', async () => {
    const phone = '+919999999999';

    // Mock Math.random to return a predictable OTP
    // Formula: Math.floor(100000 + random * 900000)
    // 100000 + 0.123456 * 900000 = 211110
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456);
    const expectedOtp = '211110';

    // 1. Request OTP
    await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(200)
      .expect((res) => {
        const body = res.body as { message?: string };
        expect(body.message).toBe('OTP sent successfully.');
      });

    // 2. Verify OTP
    let refreshToken = '';
    let cookieRefreshToken = '';

    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone, code: expectedOtp })
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          accessToken?: string;
          refreshToken?: string;
          user?: { phone: string };
        };
        expect(body.accessToken).toBeDefined();
        expect(body.refreshToken).toBeDefined();
        expect(body.user?.phone).toBe(phone);

        refreshToken = body.refreshToken as string;

        // Verify cookie
        const cookies = res.headers['set-cookie'] as unknown as string[];
        expect(cookies).toBeDefined();
        const rtCookie = cookies.find((c) => c.startsWith('refreshToken='));
        expect(rtCookie).toBeDefined();
        cookieRefreshToken = rtCookie!.split(';')[0].split('=')[1];
      });

    // Clean up random mock
    randomSpy.mockRestore();

    expect(cookieRefreshToken).toBe(refreshToken);

    // 3. Refresh Token Rotation (Happy Path)
    let newRefreshToken = '';

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          accessToken?: string;
          refreshToken?: string;
        };
        expect(body.accessToken).toBeDefined();
        expect(body.refreshToken).toBeDefined();

        newRefreshToken = body.refreshToken as string;
      });

    // 4. Token Reuse Detection
    // Trying to refresh again using the OLD/revoked refresh token should trigger global logout
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken }) // Reusing the old token
      .expect(401)
      .expect((res) => {
        const body = res.body as { error?: string };
        expect(body.error).toBe('AUTH_TOKEN_REUSED');
      });

    // Verify all sessions are deleted in DB
    const dbTokensCount = await prisma.refreshToken.count({
      where: { user: { phone } },
    });
    expect(dbTokensCount).toBe(0);

    // 5. Verify the rotated token is now also invalidated due to reuse detection global session bump
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: newRefreshToken })
      .expect(401);
  });
});
