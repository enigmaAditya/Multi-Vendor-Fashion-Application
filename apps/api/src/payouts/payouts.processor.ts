import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PayoutsService } from './payouts.service';

@Injectable()
export class PayoutsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutsProcessor.name);
  private worker: Worker;

  constructor(private readonly payoutsService: PayoutsService) {}

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
      'payouts-processing',
      async (job: Job) => {
        const { subOrderId } = job.data as { subOrderId: string };
        this.logger.log(
          `Processing escrow settlement check for sub-order: ${subOrderId}`,
        );

        const result = await this.payoutsService.settlePayout(subOrderId);

        if (result.success) {
          this.logger.log(
            `Successfully processed settlement for sub-order: ${subOrderId}`,
          );
        } else {
          this.logger.log(
            `Settlement skipped/failed for sub-order ${subOrderId}: ${result.message}`,
          );
        }
      },
      { connection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Payouts settlement job ${job?.id} failed with error: ${err.message}`,
        err.stack,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Payouts worker error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
