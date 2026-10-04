import type { DeliveryStatus, NotificationChannel as ChannelName } from '@fedsa/contract';

/** `in_app` is only a stored row, so it has no channel object */
export type SendingChannel = Exclude<ChannelName, 'in_app'>;

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** who a message goes to. a driver has a phone number and nothing else */
export interface Recipient {
  phone: string | null;
  pushSubscriptions: StoredPushSubscription[];
}

export interface OutgoingMessage {
  title: string;
  body: string;
  /** the SMS and WhatsApp text, which carries the title and any reply instruction */
  phoneText: string;
  href: string | null;
}

export interface Delivery {
  /** the phone number or push endpoint */
  to: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  /** the push service no longer knows the subscription */
  gone: boolean;
}

/**
 * one way of reaching a person. `NotificationService` chooses between them, so
 * no caller ever names a channel
 */
export interface NotificationChannel {
  readonly name: SendingChannel;
  supports(recipient: Recipient): boolean;
  /** one delivery per address. a refused send comes back as `failed` rather than throwing */
  send(recipient: Recipient, message: OutgoingMessage): Promise<Delivery[]>;
}

/** a person can have several push subscriptions, one per browser */
export function addressesFor(channel: SendingChannel, recipient: Recipient): string[] {
  if (channel === 'push') return recipient.pushSubscriptions.map((s) => s.endpoint);
  return recipient.phone ? [recipient.phone] : [];
}

export function failedDelivery(to: string, gone = false): Delivery {
  return { to, status: 'failed', providerMessageId: null, gone };
}
