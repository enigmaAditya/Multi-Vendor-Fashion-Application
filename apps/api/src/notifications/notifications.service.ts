import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { NotificationTemplatesService } from './notification-templates.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { MockSmsService } from './mock-sms.service';
import { NotificationRecipient } from './notification-channel.interface';

export interface NotificationJobData {
  outboxEventId: string;
  eventType: string;
  channel: 'EMAIL' | 'PUSH' | 'SMS';
  recipientId: string;
  recipientRole: 'BUYER' | 'SELLER';
  payload: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templatesService: NotificationTemplatesService,
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly smsService: MockSmsService,
    @InjectQueue('notifications-queue') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Fan-out outbox event into individual per-(channel, recipient) BullMQ jobs.
   * Executed by Outbox processor to isolate delivery queue from outbox drain.
   */
  async enqueueNotificationJobs(
    outboxEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const recipients = await this.resolveRecipients(eventType, payload);

    for (const recipientInfo of recipients) {
      const { userId, role } = recipientInfo;

      // Get or create user notification preferences (defaults to enabled)
      const prefs = await this.prisma.userNotificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });

      // Get user device tokens
      const deviceTokens = await this.prisma.userDeviceToken.findMany({
        where: { userId },
        select: { token: true },
      });

      // Check Push channel eligibility
      if (prefs.pushEnabled && deviceTokens.length > 0) {
        const jobData: NotificationJobData = {
          outboxEventId,
          eventType,
          channel: 'PUSH',
          recipientId: userId,
          recipientRole: role,
          payload,
        };
        await this.notificationsQueue.add('deliver-notification', jobData, {
          jobId: `notif_${outboxEventId}_PUSH_${userId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });
      }

      // Check Email channel eligibility
      if (prefs.emailEnabled) {
        const jobData: NotificationJobData = {
          outboxEventId,
          eventType,
          channel: 'EMAIL',
          recipientId: userId,
          recipientRole: role,
          payload,
        };
        await this.notificationsQueue.add('deliver-notification', jobData, {
          jobId: `notif_${outboxEventId}_EMAIL_${userId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });
      }
    }
  }

  /**
   * Delivers a single notification job with insert-as-claim atomic PENDING log lifecycle.
   */
  async deliverNotificationJob(jobData: NotificationJobData) {
    const { outboxEventId, eventType, channel, recipientId, recipientRole, payload } =
      jobData;

    // 1. Atomic claim: Insert PENDING row into NotificationLog with @@unique([outboxEventId, channel, recipientId])
    let logId: string;
    try {
      const log = await this.prisma.notificationLog.create({
        data: {
          outboxEventId,
          channel,
          recipientId,
          status: 'PENDING',
        },
      });
      logId = log.id;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Unique constraint error: duplicate delivery detected, bail out safely!
        this.logger.log(
          `[Dedup Gate] Notification for event ${outboxEventId} channel ${channel} recipient ${recipientId} already exists. Skipping duplicate send.`,
        );
        return { skipped: true, reason: 'Duplicate notification' };
      }
      throw err;
    }

    // 2. Fetch recipient user details & device tokens
    const user = await this.prisma.user.findUnique({
      where: { id: recipientId },
      include: { deviceTokens: true },
    });

    if (!user) {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'FAILED', error: 'User recipient not found.' },
      });
      return { success: false, error: 'User recipient not found' };
    }

    const recipient: NotificationRecipient = {
      userId: user.id,
      email: user.phone ? `${user.id}@marketplace.com` : undefined, // Normalized email placeholder/field
      phone: user.phone || undefined,
      deviceTokens: user.deviceTokens.map((t) => t.token),
    };

    // 3. Render HTML-escaped template
    const formattedPayload = this.templatesService.render(
      eventType,
      recipientRole,
      payload,
    );

    // 4. Dispatch via target provider channel
    let dispatchResult: { success: boolean; error?: string; invalidTokens?: string[] };
    if (channel === 'EMAIL') {
      dispatchResult = await this.emailService.send(recipient, formattedPayload);
    } else if (channel === 'PUSH') {
      dispatchResult = await this.pushService.send(recipient, formattedPayload);
    } else {
      dispatchResult = await this.smsService.send(recipient, formattedPayload);
    }

    // 5. Prune dead device tokens if FCM returned specific unregistered error codes
    if (dispatchResult.invalidTokens && dispatchResult.invalidTokens.length > 0) {
      await this.prisma.userDeviceToken.deleteMany({
        where: {
          token: { in: dispatchResult.invalidTokens },
        },
      });
      this.logger.log(
        `[Pruned Dead Tokens] Deleted ${dispatchResult.invalidTokens.length} expired FCM tokens for user ${recipientId}.`,
      );
    }

    // 6. Update NotificationLog status
    if (dispatchResult.success) {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'SENT' },
      });
      return { success: true };
    } else {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'FAILED', error: dispatchResult.error || 'Provider send failed' },
      });
      return { success: false, error: dispatchResult.error };
    }
  }

  // --- Device Token & Preference REST APIs ---
  async registerDeviceToken(userId: string, token: string, platform = 'WEB') {
    return this.prisma.userDeviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, updatedAt: new Date() },
    });
  }

  async removeDeviceToken(userId: string, token: string) {
    const existing = await this.prisma.userDeviceToken.findUnique({
      where: { token },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Device token not found.');
    }
    return this.prisma.userDeviceToken.delete({
      where: { token },
    });
  }

  async getUserPreferences(userId: string) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async updateUserPreferences(
    userId: string,
    dto: { emailEnabled?: boolean; pushEnabled?: boolean; promotionalEnabled?: boolean },
  ) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        emailEnabled: dto.emailEnabled ?? true,
        pushEnabled: dto.pushEnabled ?? true,
        promotionalEnabled: dto.promotionalEnabled ?? true,
      },
      update: {
        ...dto,
      },
    });
  }

  // --- Helper: Resolve Recipient User IDs from Event Payload ---
  private async resolveRecipients(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<Array<{ userId: string; role: 'BUYER' | 'SELLER' }>> {
    const recipients: Array<{ userId: string; role: 'BUYER' | 'SELLER' }> = [];

    const orderId = payload.orderId ? String(payload.orderId) : null;
    const subOrderId = payload.subOrderId ? String(payload.subOrderId) : null;

    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { subOrders: true },
      });
      if (order) {
        recipients.push({ userId: order.buyerId, role: 'BUYER' });
        for (const sub of order.subOrders) {
          if (!recipients.some((r) => r.userId === sub.sellerId)) {
            recipients.push({ userId: sub.sellerId, role: 'SELLER' });
          }
        }
      }
    } else if (subOrderId) {
      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id: subOrderId },
        include: { order: true },
      });
      if (subOrder) {
        recipients.push({ userId: subOrder.order.buyerId, role: 'BUYER' });
        recipients.push({ userId: subOrder.sellerId, role: 'SELLER' });
      }
    }

    return recipients;
  }
}
