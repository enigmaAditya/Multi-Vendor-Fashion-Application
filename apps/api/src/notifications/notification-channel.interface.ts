export interface NotificationRecipient {
  userId: string;
  email?: string;
  phone?: string;
  deviceTokens?: string[];
}

export interface NotificationPayload {
  subject: string;
  body: string;
  data?: Record<string, string>;
}

export interface NotificationChannel {
  channelName: 'EMAIL' | 'PUSH' | 'SMS';
  send(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ success: boolean; error?: string; invalidTokens?: string[] }>;
}
