import type { Logger } from 'pino';
import webpush from 'web-push';
import {
  failedDelivery,
  type Delivery,
  type NotificationChannel,
  type OutgoingMessage,
  type Recipient,
  type StoredPushSubscription,
} from './notification-channel.js';

/** what the channel needs from `web-push`, so tests can pass a fake */
export type PushSender = (
  subscription: StoredPushSubscription,
  payload: string,
) => Promise<unknown>;

export interface VapidSettings {
  publicKey: string;
  privateKey: string;
  /** a `mailto:` or `https:` address the push service can contact */
  subject: string;
}

/** the browser unsubscribed or the subscription expired */
const GONE_STATUSES = [404, 410];

export function vapidSender(vapid: VapidSettings): PushSender {
  return (subscription, payload) =>
    webpush.sendNotification(subscription, payload, { vapidDetails: vapid });
}

function statusCodeOf(err: unknown) {
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    return typeof err.statusCode === 'number' ? err.statusCode : null;
  }
  return null;
}

/** sent from the API itself over VAPID, with no third-party push provider */
export class WebPushChannel implements NotificationChannel {
  readonly name = 'push';
  private readonly sender: PushSender;
  private readonly logger: Logger;

  constructor(sender: PushSender, logger: Logger) {
    this.sender = sender;
    this.logger = logger;
  }

  supports(recipient: Recipient) {
    return recipient.pushSubscriptions.length > 0;
  }

  async send(recipient: Recipient, message: OutgoingMessage): Promise<Delivery[]> {
    // the service worker shows the title and body and opens `href`. no photo, to save data
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      href: message.href,
    });

    return Promise.all(
      recipient.pushSubscriptions.map(async (subscription): Promise<Delivery> => {
        try {
          await this.sender(subscription, payload);
          return {
            to: subscription.endpoint,
            status: 'sent',
            providerMessageId: null,
            gone: false,
          };
        } catch (err) {
          const statusCode = statusCodeOf(err);
          const gone = statusCode !== null && GONE_STATUSES.includes(statusCode);
          if (!gone) this.logger.warn({ statusCode }, 'web push was not accepted');
          return failedDelivery(subscription.endpoint, gone);
        }
      }),
    );
  }
}
