import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticsService } from './logistics.service';

@Injectable()
export class LogisticsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticsProcessor.name);
  private worker: Worker;
  private logisticsQueue: Queue;
  private sweeperInterval: NodeJS.Timeout;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService,
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

    // Initialize BullMQ Queue and Worker
    this.logisticsQueue = new Queue('logistics-processing', { connection });
    this.worker = new Worker(
      'logistics-processing',
      async (job: Job) => {
        const { subOrderId } = job.data as { subOrderId: string };
        this.logger.log(
          `Processing shipment sync for sub-order: ${subOrderId}`,
        );
        await this.logisticsService.syncShipment(subOrderId);
      },
      { connection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Logistics sync job ${job?.id} failed with error: ${err.message}`,
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
    if (this.logisticsQueue) {
      await this.logisticsQueue.close();
    }
  }

  async sweepOutbox() {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      // Find unprocessed order.paid events
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          eventType: 'order.paid',
          processed: false,
        },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });

      for (const event of events) {
        const payload = event.payload as Record<string, unknown>;
        const orderId = payload?.orderId as string | undefined;

        if (orderId) {
          // Fetch associated sub-orders
          const subOrders = await this.prisma.subOrder.findMany({
            where: { orderId },
          });

          for (const subOrder of subOrders) {
            await this.logisticsQueue.add('sync-shipment', {
              subOrderId: subOrder.id,
            });
          }
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
        `Error sweeping logistics outbox: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isSweeping = false;
    }
  }
}
