import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService, NotificationJobData } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Processor('notifications-queue')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<unknown> {
    this.logger.log(
      `Processing notification delivery job ${job.id} for ${job.data.channel} -> ${job.data.recipientId}`,
    );

    return this.notificationsService.deliverNotificationJob(job.data);
  }

  /**
   * Relay sweep: Polls outbox for notification-triggering events and enqueues BullMQ jobs.
   * Isolates the outbox relay from external network calls.
   */
  async processOutboxNotificationEvents() {
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
        processedAt: null,
      },
      take: 20,
      orderBy: { createdAt: 'asc' },
    });

    for (const event of events) {
      try {
        const payload =
          typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : (event.payload as Record<string, unknown>);

        await this.notificationsService.enqueueNotificationJobs(
          event.id,
          event.eventType,
          payload,
        );

        // Mark outbox event processed without waiting for external FCM/Email sends!
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.error(
          `Failed to enqueue notification jobs for outbox event ${event.id}: ${error.message}`,
        );
      }
    }
  }
}
