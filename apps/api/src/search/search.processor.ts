import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from './search.service';

@Injectable()
export class SearchProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchProcessor.name);
  private worker: Worker;
  private searchQueue: Queue;
  private sweeperInterval: NodeJS.Timeout;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
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

    // Initialize BullMQ Queue and Worker for Search Indexing
    this.searchQueue = new Queue('search-processing', { connection });
    this.worker = new Worker(
      'search-processing',
      async (job: Job) => {
        const { productId } = job.data as { productId: string };
        this.logger.log(
          `Processing search index sync for product: ${productId}`,
        );
        await this.searchService.upsertProductToIndex(productId);
      },
      { connection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Search index sync job ${job?.id} failed with error: ${err.message}`,
        err.stack,
      );
    });

    // Start outbox polling sweeper (runs every 5 seconds, bypassed in test mode)
    if (process.env.NODE_ENV !== 'test') {
      this.sweeperInterval = setInterval(() => {
        void this.sweepOutbox();
      }, 5000);
    }
  }

  async onModuleDestroy() {
    if (this.sweeperInterval) {
      clearInterval(this.sweeperInterval);
    }
    if (this.worker) {
      await this.worker.close();
    }
    if (this.searchQueue) {
      await this.searchQueue.close();
    }
  }

  private async sweepOutbox() {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      // Find unprocessed product and stock changes outbox events
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'product.created',
              'product.updated',
              'product.status_changed',
              'stock.availability_changed',
            ],
          },
          processed: false,
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });

      for (const event of events) {
        const payload = (
          typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : event.payload
        ) as Record<string, unknown>;
        const productId = payload?.productId as string | undefined;

        if (productId) {
          await this.searchQueue.add('sync-search-index', {
            productId,
          });
        }

        // Mark event as processed
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Error sweeping search index outbox: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isSweeping = false;
    }
  }
}
