import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AUTH_ERRORS } from '@marketplace/constants';
import * as crypto from 'crypto';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({}),
  }),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockPrisma = {
    otpRequest: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    oAuthAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: RedisService,
          useValue: { getClient: () => mockRedisClient },
        },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('requestOtp', () => {
    it('should throw RATE_LIMIT_EXCEEDED if request is throttled in Redis', async () => {
      mockRedisClient.get.mockResolvedValue('1');

      await expect(service.requestOtp('+919999999999')).rejects.toThrow(
        new HttpException(
          {
            error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED,
            message: 'Please wait 60 seconds before requesting another OTP.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'otp_throttle:+919999999999',
      );
    });

    it('should create and store OTP request in DB and set throttle in Redis', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.otpRequest.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.otpRequest.create.mockResolvedValue({});

      await service.requestOtp('+919999999999');

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'otp_throttle:+919999999999',
      );
      expect(mockPrisma.otpRequest.updateMany).toHaveBeenCalledWith({
        where: {
          phone: '+919999999999',
          expiresAt: { gt: expect.any(Date) as unknown as Date },
        },
        data: { expiresAt: new Date(0) },
      });
      expect(mockPrisma.otpRequest.create).toHaveBeenCalledWith({
        data: {
          phone: '+919999999999',
          codeHash: expect.any(String) as unknown as string,
          attempts: 0,
          expiresAt: expect.any(Date) as unknown as Date,
        },
      });
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'otp_throttle:+919999999999',
        '1',
        'EX',
        60,
      );
    });
  });

  describe('verifyOtp', () => {
    const rawOtp = '123456';
    const codeHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

    it('should throw OTP_EXPIRED if active OTP request does not exist', async () => {
      mockPrisma.otpRequest.findFirst.mockResolvedValue(null);

      await expect(service.verifyOtp('+919999999999', rawOtp)).rejects.toThrow(
        new HttpException(
          {
            error: AUTH_ERRORS.OTP_EXPIRED,
            message: 'OTP has expired or does not exist.',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('should increment attempt count on mismatch and throw OTP_INVALID if attempts remaining', async () => {
      mockPrisma.otpRequest.findFirst.mockResolvedValue({
        id: 'otp-id',
        phone: '+919999999999',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.verifyOtp('+919999999999', '000000'),
      ).rejects.toThrow(
        new HttpException(
          {
            error: AUTH_ERRORS.OTP_INVALID,
            message: 'Invalid OTP. 2 attempts remaining.',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );

      expect(mockPrisma.otpRequest.update).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { attempts: 1 },
      });
    });

    it('should invalidate OTP and throw OTP_EXPIRED if attempts exhausted (3 attempts)', async () => {
      mockPrisma.otpRequest.findFirst.mockResolvedValue({
        id: 'otp-id',
        phone: '+919999999999',
        codeHash,
        attempts: 2,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.verifyOtp('+919999999999', '000000'),
      ).rejects.toThrow(
        new HttpException(
          {
            error: AUTH_ERRORS.OTP_EXPIRED,
            message: 'Too many incorrect attempts. OTP has been invalidated.',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );

      expect(mockPrisma.otpRequest.update).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { expiresAt: new Date(0) },
      });
    });

    it('should authenticate user and issue sessions on happy path', async () => {
      const mockUser = {
        id: 'user-id',
        phone: '+919999999999',
        email: null,
        roles: ['USER'],
        tokenVersion: 0,
      };

      mockPrisma.otpRequest.findFirst.mockResolvedValue({
        id: 'otp-id',
        phone: '+919999999999',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 100000),
      });
      mockPrisma.otpRequest.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.verifyOtp('+919999999999', rawOtp);

      expect(mockPrisma.otpRequest.update).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { expiresAt: new Date(0) },
      });
      expect(mockJwt.signAsync).toHaveBeenCalledTimes(2);
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.id).toBe('user-id');
    });
  });

  describe('refreshSession & Reuse Detection', () => {
    it('should throw SESSION_INVALID if refresh token verification fails', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refreshSession('bad-token')).rejects.toThrow(
        new HttpException(
          {
            error: AUTH_ERRORS.SESSION_INVALID,
            message: 'Invalid or expired refresh token.',
          },
          HttpStatus.UNAUTHORIZED,
        ),
      );
    });

    it('should trigger reuse detection, bump version, delete tokens, and throw TOKEN_REUSED if token is not found in DB', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        version: 0,
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshSession('reused-token')).rejects.toThrow(
        new HttpException(
          {
            error: AUTH_ERRORS.TOKEN_REUSED,
            message:
              'Security breach: session reuse detected. Please re-login.',
          },
          HttpStatus.UNAUTHORIZED,
        ),
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
      });
    });

    it('should rotate session successfully on valid refresh token', async () => {
      const mockUser = {
        id: 'user-id',
        tokenVersion: 0,
        roles: ['USER'],
      };

      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        version: 0,
      });

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        tokenHash: 'hash',
        userId: 'user-id',
        user: mockUser,
      });

      mockPrisma.refreshToken.delete.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      mockJwt.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshSession('valid-token');

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-id' },
      });
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });
  });
});
