import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPayload,
  NotificationRecipient,
} from './notification-channel.interface';

@Injectable()
export class PushService implements NotificationChannel {
  private readonly logger = new Logger(PushService.name);
  readonly channelName = 'PUSH';

  async send(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ success: boolean; error?: string; invalidTokens?: string[] }> {
    await Promise.resolve();
    if (!recipient.deviceTokens || recipient.deviceTokens.length === 0) {
      return {
        success: false,
        error: 'No active device tokens found for recipient.',
      };
    }

    const invalidTokens: string[] = [];
    let sentCount = 0;

    for (const token of recipient.deviceTokens) {
      try {
        // Simulated FCM / Web Push dispatch
        // In FCM SDK, if token is invalid, it throws `messaging/registration-token-not-registered` or `UNREGISTERED`
        if (token.includes('invalid') || token.includes('expired')) {
          invalidTokens.push(token);
          this.logger.warn(`Push token ${token} expired or unregistered.`);
          continue;
        }

        this.logger.log(
          `[Push Sent] Token: ${token.slice(0, 10)}... | Title: "${payload.subject}" | Body: "${payload.body}"`,
        );
        sentCount++;
      } catch (err: unknown) {
        const error = err as Error;
        if (
          error.message.includes('UNREGISTERED') ||
          error.message.includes('registration-token-not-registered') ||
          error.message.includes('INVALID_REGISTRATION')
        ) {
          invalidTokens.push(token);
        } else {
          this.logger.error(
            `Transient push error for token ${token}: ${error.message}`,
          );
        }
      }
    }

    if (
      sentCount === 0 &&
      invalidTokens.length === recipient.deviceTokens.length
    ) {
      return {
        success: false,
        error: 'All recipient device tokens are invalid or expired.',
        invalidTokens,
      };
    }

    return {
      success: sentCount > 0,
      invalidTokens,
    };
  }
}
