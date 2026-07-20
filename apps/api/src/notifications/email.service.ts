import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
} from './notification-channel.interface';

@Injectable()
export class EmailService implements NotificationChannel {
  private readonly logger = new Logger(EmailService.name);
  readonly channelName = 'EMAIL';

  async send(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ success: boolean; error?: string }> {
    await Promise.resolve();
    if (!recipient.email) {
      return { success: false, error: 'Recipient email address missing.' };
    }

    try {
      // Production uses Nodemailer / SMTP / Resend SDK.
      // Mock log dispatch for development & test environment.
      this.logger.log(
        `[Email Sent] To: ${recipient.email} | Subject: "${payload.subject}" | Body: "${payload.body}"`,
      );

      return { success: true };
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Failed to send email to ${recipient.email}: ${error.message}`,
      );
      return { success: false, error: error.message };
    }
  }
}
