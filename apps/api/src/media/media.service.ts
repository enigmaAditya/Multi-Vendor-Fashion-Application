import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { validateMagicBytes } from './magic-bytes.helper';
import { Queue } from 'bullmq';

@Injectable()
export class MediaService implements OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);
  private readonly mediaQueue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    let connection: Record<string, unknown> | undefined;
    try {
      const parsed = new URL(redisUrl);
      connection = {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      connection = {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
      };
    }

    this.mediaQueue = new Queue('media-processing', { connection });
    this.mediaQueue.on('error', (err) => {
      this.logger.error(`Media queue error: ${err.message}`, err.stack);
    });

    const queueConn = (
      this.mediaQueue as unknown as {
        connection?: {
          on: (event: string, fn: (err: Error) => void) => void;
        };
      }
    ).connection;
    queueConn?.on('error', (err: Error) => {
      this.logger.warn(
        `Media queue connection event: ${err.message}`,
        err.stack,
      );
    });
  }

  async onModuleDestroy() {
    await this.mediaQueue.close();
  }

  async generateUploadUrl(
    userId: string,
    filename: string,
    contentType: string,
  ) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      throw new BadRequestException(
        'Invalid content type. Only JPEG, PNG, and WebP are allowed.',
      );
    }

    const { url, fields, key } = await this.storage.generatePresignedPost(
      filename,
      contentType,
    );

    const media = await this.prisma.media.create({
      data: {
        filename,
        contentType,
        storageKey: key,
        userId,
        status: 'PENDING_UPLOAD',
      },
    });

    return {
      mediaId: media.id,
      uploadUrl: url,
      fields,
    };
  }

  async confirmUpload(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('Media record not found.');
    }

    if (media.userId !== userId) {
      throw new ForbiddenException('You do not own this media.');
    }

    if (media.status !== 'PENDING_UPLOAD') {
      throw new BadRequestException(
        `Media is already in ${media.status} state.`,
      );
    }

    const exists = await this.storage.checkObjectExists(media.storageKey);
    if (!exists) {
      throw new BadRequestException(
        'Object has not been uploaded to storage yet.',
      );
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObjectRange(media.storageKey, 0, 99);
    } catch (err) {
      this.logger.error('Failed to retrieve magic bytes from storage.', err);
      throw new BadRequestException('Failed to read upload headers.');
    }

    const isValid = validateMagicBytes(buffer, media.contentType);
    if (!isValid) {
      await this.prisma.media.update({
        where: { id: mediaId },
        data: { status: 'FAILED' },
      });
      await this.storage.deleteObject(media.storageKey);
      throw new BadRequestException(
        'File content does not match the declared image format (magic-bytes verification failed).',
      );
    }

    await this.prisma.media.update({
      where: { id: mediaId },
      data: { status: 'UPLOADED' },
    });

    await this.mediaQueue.add(
      'process-image',
      { mediaId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    return {
      status: 'PROCESSING',
      mediaId,
    };
  }

  async getMediaStatus(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('Media record not found.');
    }

    if (media.userId !== userId) {
      throw new ForbiddenException('You do not own this media.');
    }

    return {
      id: media.id,
      status: media.status,
      processedUrls: media.processedUrls,
    };
  }
}
