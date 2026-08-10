import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryProcessor.name);
  private worker: Worker;

  constructor(private readonly inventoryService: InventoryService) {}

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
      'inventory-processing',
      async (job: Job) => {
        const { reservationCode } = job.data as { reservationCode: string };
        this.logger.log(
          `Processing TTL expiration check for reservation: ${reservationCode}`,
        );

        // Sweeper calls releaseReservation with admin flag set to true (ignores user context)
        const result = await this.inventoryService.releaseReservation(
          'system',
          reservationCode,
          true,
        );

        if (result.success) {
          this.logger.log(
            `Expired reservation ${reservationCode} successfully released.`,
          );
        } else {
          this.logger.log(
            `Reservation ${reservationCode} was already finalized. Skipping release.`,
          );
        }
      },
      { connection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Inventory job ${job?.id} failed with error: ${err.message}`,
        err.stack,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Inventory worker error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
