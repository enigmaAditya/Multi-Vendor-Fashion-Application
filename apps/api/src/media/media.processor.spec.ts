import { Test, TestingModule } from '@nestjs/testing';
import { MediaProcessor } from './media.processor';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

jest.mock('bullmq', () => {
  return {
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  };
});

jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    resize: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('optimized-webp-bytes')),
  }));
});

describe('MediaProcessor', () => {
  let processor: MediaProcessor;
  let moduleRef: TestingModule;

  const mockPrisma: any = {
    media: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockStorage = {
    getFullObject: jest.fn(),
    uploadProcessed: jest.fn(),
    deleteObject: jest.fn(),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        MediaProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    processor = moduleRef.get<MediaProcessor>(MediaProcessor);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('Atomic Claim Check & Double Processing', () => {
    const mediaId = 'media-1';

    it('should successfully claim job and process if media status is UPLOADED', async () => {
      mockPrisma.media.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.media.findUnique.mockResolvedValue({
        id: mediaId,
        userId: 'user-1',
        storageKey: 'raw/img.png',
        status: 'PROCESSING',
      });

      mockStorage.getFullObject.mockResolvedValue(
        Buffer.from('dummy-image-bytes'),
      );
      mockStorage.uploadProcessed.mockResolvedValue('https://cdn.com/img.webp');

      await processor.processImage(mediaId);

      expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: mediaId, status: 'UPLOADED' },
        data: { status: 'PROCESSING' },
      });
      expect(mockPrisma.media.update).toHaveBeenCalled();
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
      expect(mockStorage.deleteObject).toHaveBeenCalledWith('raw/img.png');
    });

    it('should remain PROCESSED if post-commit deleteObject fails', async () => {
      mockPrisma.media.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.media.findUnique.mockResolvedValue({
        id: mediaId,
        userId: 'user-1',
        storageKey: 'raw/img.png',
        status: 'PROCESSING',
      });

      mockStorage.getFullObject.mockResolvedValue(
        Buffer.from('dummy-image-bytes'),
      );
      mockStorage.uploadProcessed.mockResolvedValue('https://cdn.com/img.webp');

      mockStorage.deleteObject.mockRejectedValueOnce(
        new Error('S3 delete object connection timeout'),
      );

      await expect(processor.processImage(mediaId)).resolves.not.toThrow();

      expect(mockPrisma.media.update).toHaveBeenCalled();
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledTimes(1);
    });

    it('should bail out immediately if media status is not UPLOADED (affected 0 rows)', async () => {
      mockPrisma.media.updateMany.mockResolvedValue({ count: 0 });

      await processor.processImage(mediaId);

      expect(mockPrisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: mediaId, status: 'UPLOADED' },
        data: { status: 'PROCESSING' },
      });
      expect(mockStorage.getFullObject).not.toHaveBeenCalled();
      expect(mockPrisma.media.update).not.toHaveBeenCalled();
      expect(mockStorage.deleteObject).not.toHaveBeenCalled();
    });
  });
});
