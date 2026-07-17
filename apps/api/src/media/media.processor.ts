import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import sharp from 'sharp';

@Injectable()
export class MediaProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaProcessor.name);
  private worker: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
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

    this.worker = new Worker(
      'media-processing',
      async (job: Job) => {
        const data = job.data as { mediaId: string };
        await this.processImage(data.mediaId);
      },
      { connection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id} failed with error: ${err.message}`,
        err.stack,
      );
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  async processImage(mediaId: string) {
    this.logger.log(`Processing media job for media ID: ${mediaId}`);

    const affected = await this.prisma.media.updateMany({
      where: {
        id: mediaId,
        status: 'UPLOADED',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    if (affected.count === 0) {
      this.logger.warn(
        `Media ID ${mediaId} is not in UPLOADED status. Bailing out (idempotent).`,
      );
      return;
    }

    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      this.logger.error(
        `Media ID ${mediaId} claimed but not found in database.`,
      );
      return;
    }

    try {
      const rawBuffer = await this.storage.getFullObject(media.storageKey);

      const thumbnailBuffer = await sharp(rawBuffer)
        .resize(150, 150, { fit: 'cover' })
        .toFormat('webp')
        .toBuffer();

      const detailBuffer = await sharp(rawBuffer)
        .resize(800, null, { withoutEnlargement: true })
        .toFormat('webp')
        .toBuffer();

      const thumbnailKey = `processed/thumbnail-${mediaId}.webp`;
      const detailKey = `processed/detail-${mediaId}.webp`;

      const thumbnailUrl = await this.storage.uploadProcessed(
        thumbnailKey,
        thumbnailBuffer,
        'image/webp',
      );
      const detailUrl = await this.storage.uploadProcessed(
        detailKey,
        detailBuffer,
        'image/webp',
      );

      const processedUrls = {
        thumbnail: thumbnailUrl,
        detail: detailUrl,
      };

      await this.prisma.$transaction(async (tx) => {
        await tx.media.update({
          where: { id: mediaId },
          data: {
            status: 'PROCESSED',
            processedUrls,
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'media.processed',
            payload: {
              mediaId,
              userId: media.userId,
              processedUrls,
            },
          },
        });
      });

      await this.storage.deleteObject(media.storageKey);

      this.logger.log(`Media ID ${mediaId} processed successfully.`);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Error processing image ${mediaId}: ${error.message}`,
        error.stack,
      );

      await this.prisma.media.update({
        where: { id: mediaId },
        data: { status: 'FAILED' },
      });
    }
  }
}
