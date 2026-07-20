import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
} from './notification-channel.interface';

@Injectable()
export class MockSmsService implements NotificationChannel {
  private readonly logger = new Logger(MockSmsService.name);
  readonly channelName = 'SMS';

  async send(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ success: boolean; error?: string }> {
    if (!recipient.phone) {
      return { success: false, error: 'Recipient phone number missing.' };
    }

    this.logger.log(
      `[SMS Sent (Mock)] Phone: ${recipient.phone} | Message: "${payload.body}"`,
    );

    return { success: true };
  }
}
