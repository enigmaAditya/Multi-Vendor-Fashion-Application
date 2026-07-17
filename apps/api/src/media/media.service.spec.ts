import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validateMagicBytes } from './magic-bytes.helper';

describe('MediaService & Magic Bytes', () => {
  let service: MediaService;
  let moduleRef: TestingModule;

  const mockPrisma = {
    media: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockStorage = {
    generatePresignedPost: jest.fn(),
    checkObjectExists: jest.fn(),
    getObjectRange: jest.fn(),
    deleteObject: jest.fn(),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = moduleRef.get<MediaService>(MediaService);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('Magic Bytes Validation', () => {
    it('should validate JPEG headers correctly', () => {
      const validJpeg = Buffer.from('ffd8ffe000104a4649460001', 'hex');
      expect(validateMagicBytes(validJpeg, 'image/jpeg')).toBe(true);

      const invalidJpeg = Buffer.from('89504e470d0a1a0a', 'hex');
      expect(validateMagicBytes(invalidJpeg, 'image/jpeg')).toBe(false);
    });

    it('should validate PNG headers correctly', () => {
      const validPng = Buffer.from('89504e470d0a1a0a', 'hex');
      expect(validateMagicBytes(validPng, 'image/png')).toBe(true);
    });

    it('should validate WebP headers correctly', () => {
      const validWebp = Buffer.alloc(12);
      validWebp.write('RIFF', 0, 'ascii');
      validWebp.write('WEBP', 8, 'ascii');

      expect(validateMagicBytes(validWebp, 'image/webp')).toBe(true);
    });

    it('should reject GIF or any other unlisted header', () => {
      const gifHeader = Buffer.from('474946383961', 'hex');
      expect(validateMagicBytes(gifHeader, 'image/gif')).toBe(false);
    });
  });

  describe('Upload Confirmation & IDOR checks', () => {
    const userId = 'user-1';
    const mediaId = 'media-1';

    it('should throw ForbiddenException if a user tries to confirm another users media', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({
        id: mediaId,
        userId: 'different-user',
        status: 'PENDING_UPLOAD',
      });

      await expect(service.confirmUpload(userId, mediaId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if media record does not exist', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(null);

      await expect(service.confirmUpload(userId, mediaId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should mark status as FAILED and delete raw object if magic bytes validation fails', async () => {
      mockPrisma.media.findUnique.mockResolvedValue({
        id: mediaId,
        userId,
        contentType: 'image/png',
        storageKey: 'raw/file.png',
        status: 'PENDING_UPLOAD',
      });

      mockStorage.checkObjectExists.mockResolvedValue(true);
      mockStorage.getObjectRange.mockResolvedValue(
        Buffer.from('invalid-png-header'),
      );

      await expect(service.confirmUpload(userId, mediaId)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.media.update).toHaveBeenCalledWith({
        where: { id: mediaId },
        data: { status: 'FAILED' },
      });
      expect(mockStorage.deleteObject).toHaveBeenCalledWith('raw/file.png');
    });
  });
});
