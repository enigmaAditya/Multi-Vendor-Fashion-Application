import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import {
  NotificationsService,
  NotificationJobData,
} from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker: Worker;
  private notificationsQueue: Queue;
  private sweeperInterval: NodeJS.Timeout;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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

    this.notificationsQueue = new Queue('notifications-queue', { connection });
    this.worker = new Worker(
      'notifications-queue',
      async (job: Job<NotificationJobData>) => {
        this.logger.log(
          `Processing notification delivery job ${job.id} for ${job.data.channel} -> ${job.data.recipientId}`,
        );
        return this.notificationsService.deliverNotificationJob(job.data);
      },
      { connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Notification job ${job?.id} failed with error: ${err.message}`,
      );
    });

    // Provide Queue instance to NotificationsService
    this.notificationsService.setQueue(this.notificationsQueue);

    // Poll outbox every 5 seconds
    this.sweeperInterval = setInterval(() => {
      this.processOutboxNotificationEvents().catch((err: unknown) => {
        const error = err as Error;
        this.logger.error(
          `Error in outbox notification sweeper: ${error.message}`,
        );
      });
    }, 5000);
  }

  async onModuleDestroy() {
    if (this.sweeperInterval) {
      clearInterval(this.sweeperInterval);
    }
    if (this.worker) {
      await this.worker.close();
    }
    if (this.notificationsQueue) {
      await this.notificationsQueue.close();
    }
  }

  /**
   * Relay sweep: Polls outbox for notification-triggering events and enqueues BullMQ jobs.
   * Isolates the outbox relay from external network calls.
   */
  async processOutboxNotificationEvents() {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      const supportedEventTypes = [
        'order.paid',
        'shipment.dispatched',
        'shipment.out_for_delivery',
        'shipment.delivered',
        'payout.settled',
        'payment.refund_required',
      ];

      const events = await this.prisma.outboxEvent.findMany({
        where: {
          eventType: { in: supportedEventTypes },
          processed: false,
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });

      for (const event of events) {
        try {
          const payload =
            typeof event.payload === 'string'
              ? (JSON.parse(event.payload) as Record<string, unknown>)
              : (event.payload as Record<string, unknown>);

          await this.notificationsService.enqueueNotificationJobs(
            event.id,
            event.eventType,
            payload,
          );

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              processed: true,
              processedAt: new Date(),
            },
          });
        } catch (err: unknown) {
          const error = err as Error;
          this.logger.error(
            `Failed to enqueue notification jobs for outbox event ${event.id}: ${error.message}`,
          );
        }
      }
    } finally {
      this.isSweeping = false;
    }
  }
}
