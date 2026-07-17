import * as fs from 'fs';
import * as path from 'path';
import { uuidv7 } from 'uuidv7';

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
import { StorageService } from '../src/media/storage.service';

describe('Media System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let sellerId: string;
  let otherSellerId: string;
  let sellerToken: string;
  let otherSellerToken: string;

  const mockStorage = {
    generatePresignedPost: jest.fn().mockImplementation((filename: string) => {
      const key = `raw/${uuidv7()}-${filename}`;
      return {
        url: 'http://localhost:9000/media',
        fields: { key },
        key,
      };
    }),
    checkObjectExists: jest.fn().mockResolvedValue(true),
    getObjectRange: jest
      .fn()
      .mockResolvedValue(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
          'base64',
        ),
      ),
    getFullObject: jest
      .fn()
      .mockResolvedValue(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
          'base64',
        ),
      ),
    uploadProcessed: jest.fn().mockResolvedValue('https://cdn.com/img.webp'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(mockStorage)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    sellerId = uuidv7();
    otherSellerId = uuidv7();

    // Create users in DB
    await prisma.user.createMany({
      data: [
        { id: sellerId, email: 'seller@media.com', roles: ['SELLER'] },
        {
          id: otherSellerId,
          email: 'other@media.com',
          roles: ['SELLER'],
        },
      ],
    });

    sellerToken = await jwtService.signAsync(
      { sub: sellerId, roles: ['SELLER'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
    otherSellerToken = await jwtService.signAsync(
      { sub: otherSellerId, roles: ['SELLER'] },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-12345',
        expiresIn: '15m',
      },
    );
  });

  afterAll(async () => {
    // Cleanup
    await prisma.productAttributeValueMap.deleteMany({});
    await prisma.sku.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.brand.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
    await prisma.media.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
    await app.close();
  });

  describe('REST Endpoints', () => {
    let mediaId: string;

    it('should generate a presigned url and create a media record', async () => {
      const res = await request(app.getHttpServer())
        .post('/media/presigned-url')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          filename: 'shirt.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(res.body).toHaveProperty('mediaId');
      expect(res.body).toHaveProperty('uploadUrl');
      mediaId = res.body.mediaId;
    });

    it('should fail upload confirmation for invalid file headers (magic bytes failed)', async () => {
      mockStorage.getObjectRange.mockResolvedValueOnce(
        Buffer.from('invalid-file-bytes'),
      );

      const res = await request(app.getHttpServer())
        .post('/media/confirm')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ mediaId })
        .expect(400);

      expect(res.body.message).toContain('magic-bytes verification failed');

      // Verify DB status is FAILED
      const record = await prisma.media.findUnique({ where: { id: mediaId } });
      expect(record?.status).toBe('FAILED');
    });

    it('should successfully confirm valid upload and trigger processing', async () => {
      // Re-create a pending record for the test
      const resUrl = await request(app.getHttpServer())
        .post('/media/presigned-url')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          filename: 'shirt2.png',
          contentType: 'image/png',
        })
        .expect(201);

      const newMediaId = resUrl.body.mediaId;

      const resConfirm = await request(app.getHttpServer())
        .post('/media/confirm')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ mediaId: newMediaId })
        .expect(201);

      expect(resConfirm.body.status).toBe('PROCESSING');

      const record = await prisma.media.findUnique({
        where: { id: newMediaId },
      });
      expect(record?.status).toBe('UPLOADED');
    });

    it('should reject confirmation from a different user (IDOR check)', async () => {
      const resUrl = await request(app.getHttpServer())
        .post('/media/presigned-url')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          filename: 'shirt3.png',
          contentType: 'image/png',
        })
        .expect(201);

      const targetMediaId = resUrl.body.mediaId;

      await request(app.getHttpServer())
        .post('/media/confirm')
        .set('Authorization', `Bearer ${otherSellerToken}`)
        .send({ mediaId: targetMediaId })
        .expect(403);
    });

    it('should reject status query from a different user (IDOR check)', async () => {
      const resUrl = await request(app.getHttpServer())
        .post('/media/presigned-url')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          filename: 'shirt4.png',
          contentType: 'image/png',
        })
        .expect(201);

      const targetMediaId = resUrl.body.mediaId;

      await request(app.getHttpServer())
        .get(`/media/${targetMediaId}/status`)
        .set('Authorization', `Bearer ${otherSellerToken}`)
        .expect(403);
    });
  });
});
