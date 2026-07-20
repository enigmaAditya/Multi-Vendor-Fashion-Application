import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTemplatesService } from './notification-templates.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { MockSmsService } from './mock-sms.service';
import { Prisma } from '@prisma/client';

describe('NotificationsService & NotificationTemplatesService', () => {
  let service: NotificationsService;
  let templatesService: NotificationTemplatesService;

  const mockPrisma = {
    notificationLog: {
      create: jest.fn(),
      update: jest.fn(),
    },
    userNotificationPreference: {
      upsert: jest.fn(),
    },
    userDeviceToken: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    subOrder: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        NotificationTemplatesService,
        EmailService,
        PushService,
        MockSmsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    templatesService = module.get<NotificationTemplatesService>(
      NotificationTemplatesService,
    );
    jest.clearAllMocks();
  });

  describe('NotificationTemplatesService', () => {
    it('should escape HTML tags to prevent injection in email clients', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const escaped = templatesService.escapeHtml(maliciousInput);
      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      );
    });

    it('should correctly render order.paid buyer template with escaped variables', () => {
      const payload = {
        orderId: '<script>order123</script>',
        amountCharged: '150000', // ₹1500.00
      };

      const template = templatesService.render('order.paid', 'BUYER', payload);
      expect(template.subject).toContain('Order Confirmed');
      expect(template.body).toContain('&lt;script&gt;order123&lt;/script&gt;');
      expect(template.body).toContain('₹1500.00');
    });

    it('should correctly render shipment.dispatched template with AWB', () => {
      const payload = {
        subOrderId: 'sub-1',
        awbCode: 'AWB999999',
        courierName: 'Delhivery',
      };

      const template = templatesService.render(
        'shipment.dispatched',
        'BUYER',
        payload,
      );
      expect(template.subject).toContain('Shipment Dispatched');
      expect(template.body).toContain('Delhivery');
      expect(template.body).toContain('AWB999999');
    });
  });

  describe('deliverNotificationJob (Atomic Claim & Dedup Gate)', () => {
    it('should gracefully skip sending on P2002 duplicate log constraint error', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('P2002', {
        code: 'P2002',
        clientVersion: '7.0.0',
      });
      mockPrisma.notificationLog.create.mockRejectedValue(prismaError);

      const result = await service.deliverNotificationJob({
        outboxEventId: 'event-1',
        eventType: 'order.paid',
        channel: 'EMAIL',
        recipientId: 'user-1',
        recipientRole: 'BUYER',
        payload: { orderId: 'ord-1' },
      });

      expect(result.skipped).toBe(true);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should prune dead tokens when PushService returns invalidTokens', async () => {
      mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        phone: '+919999999999',
        deviceTokens: [{ token: 'expired_fcm_token_123' }],
      });
      mockPrisma.userDeviceToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.notificationLog.update.mockResolvedValue({});

      const result = await service.deliverNotificationJob({
        outboxEventId: 'event-2',
        eventType: 'shipment.dispatched',
        channel: 'PUSH',
        recipientId: 'user-1',
        recipientRole: 'BUYER',
        payload: {
          subOrderId: 'sub-1',
          awbCode: 'AWB123',
          courierName: 'Shiprocket',
        },
      });

      expect(result.success).toBe(false);
      expect(mockPrisma.userDeviceToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ['expired_fcm_token_123'] } },
      });
    });
  });
});
