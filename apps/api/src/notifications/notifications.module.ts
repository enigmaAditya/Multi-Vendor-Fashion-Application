import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsController } from './notifications.controller';
import { NotificationTemplatesService } from './notification-templates.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { MockSmsService } from './mock-sms.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'notifications-queue',
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationTemplatesService,
    EmailService,
    PushService,
    MockSmsService,
  ],
  exports: [NotificationsService, NotificationsProcessor],
})
export class NotificationsModule {}
