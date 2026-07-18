import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class UnconfirmedSweeperService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(UnconfirmedSweeperService.name);
  private intervalId: NodeJS.Timeout;
  private timeoutId: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    // Run sweeper every hour
    const oneHour = 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      void this.sweep();
    }, oneHour);
    // Run an initial sweep 10 seconds after boot
    this.timeoutId = setTimeout(() => {
      void this.sweep();
    }, 10000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  async sweep() {
    this.logger.log('Running unconfirmed media sweeper...');
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Find stuck PENDING_UPLOAD records older than 1 hour
      const staleMedia = await this.prisma.media.findMany({
        where: {
          status: 'PENDING_UPLOAD',
          createdAt: { lt: oneHourAgo },
          productImage: null,
        },
      });

      if (staleMedia.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${staleMedia.length} stale pending uploads to sweep.`,
      );

      for (const media of staleMedia) {
        await this.storage.deleteObject(media.storageKey);
        await this.prisma.media.delete({
          where: { id: media.id },
        });
        this.logger.log(`Successfully swept stale media: ${media.id}`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Error in unconfirmed media sweeper: ${error.message}`,
        error.stack,
      );
    }
  }
}
