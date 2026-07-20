import { Injectable } from '@nestjs/common';
import { NotificationPayload } from './notification-channel.interface';

@Injectable()
export class NotificationTemplatesService {
  /**
   * Escape HTML special characters to prevent HTML/XSS injection in email clients
   */
  escapeHtml(str: string | number | undefined | null): string {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  render(
    eventType: string,
    recipientRole: 'BUYER' | 'SELLER',
    eventPayload: Record<string, unknown>,
  ): NotificationPayload {
    const rawOrderId =
      typeof eventPayload.orderId === 'string' ? eventPayload.orderId : '';
    const rawSubOrderId =
      typeof eventPayload.subOrderId === 'string'
        ? eventPayload.subOrderId
        : '';
    const rawAmount =
      eventPayload.amountCharged !== undefined &&
      eventPayload.amountCharged !== null
        ? String(eventPayload.amountCharged as string | number | bigint)
        : eventPayload.amount !== undefined && eventPayload.amount !== null
          ? String(eventPayload.amount as string | number | bigint)
          : '';
    const rawAwb =
      typeof eventPayload.awbCode === 'string' ? eventPayload.awbCode : '';
    const rawCourier =
      typeof eventPayload.courierName === 'string'
        ? eventPayload.courierName
        : 'Shiprocket';

    const orderId = this.escapeHtml(rawOrderId);
    const subOrderId = this.escapeHtml(rawSubOrderId);
    const awbCode = this.escapeHtml(rawAwb);
    const courierName = this.escapeHtml(rawCourier);

    const amountInRupees = rawAmount
      ? (Number(rawAmount) / 100).toFixed(2)
      : '0.00';

    switch (eventType) {
      case 'order.paid':
        if (recipientRole === 'BUYER') {
          return {
            subject: `Order Confirmed #${orderId.slice(0, 8)}`,
            body: `Thank you for your purchase! Your order #${orderId} of ₹${amountInRupees} has been confirmed.`,
            data: { orderId: rawOrderId, type: 'order.paid' },
          };
        } else {
          return {
            subject: `New Order Received #${subOrderId.slice(0, 8)}`,
            body: `You have received a new sub-order #${subOrderId}. Please prepare items for dispatch.`,
            data: { subOrderId: rawSubOrderId, type: 'order.paid' },
          };
        }

      case 'shipment.dispatched':
        return {
          subject: `Shipment Dispatched #${subOrderId.slice(0, 8)}`,
          body: `Your order shipment #${subOrderId} has been dispatched via ${courierName}. AWB: ${awbCode}.`,
          data: {
            subOrderId: rawSubOrderId,
            awbCode: rawAwb,
            type: 'shipment.dispatched',
          },
        };

      case 'shipment.out_for_delivery':
        return {
          subject: `Out for Delivery #${subOrderId.slice(0, 8)}`,
          body: `Your package #${subOrderId} is out for delivery today via ${courierName}!`,
          data: {
            subOrderId: rawSubOrderId,
            type: 'shipment.out_for_delivery',
          },
        };

      case 'shipment.delivered':
        return {
          subject: `Package Delivered #${subOrderId.slice(0, 8)}`,
          body: `Your order #${subOrderId} has been delivered! Tap here to leave a product review.`,
          data: { subOrderId: rawSubOrderId, type: 'shipment.delivered' },
        };

      case 'payout.settled':
        return {
          subject: `Payout Disbursed ₹${amountInRupees}`,
          body: `Your payout of ₹${amountInRupees} for sub-order #${subOrderId} has been successfully settled to your bank account.`,
          data: { subOrderId: rawSubOrderId, type: 'payout.settled' },
        };

      case 'payment.refund_required':
        return {
          subject: `Refund Alert for Order #${orderId.slice(0, 8)}`,
          body: `An issue occurred during checkout fulfillment. Your payment of ₹${amountInRupees} is being refunded.`,
          data: { orderId: rawOrderId, type: 'payment.refund_required' },
        };

      default:
        return {
          subject: `Marketplace Alert: ${this.escapeHtml(eventType)}`,
          body: `Event notification for ${this.escapeHtml(eventType)}.`,
          data: { type: eventType },
        };
    }
  }
}
