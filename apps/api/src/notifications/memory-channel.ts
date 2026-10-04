import {
  addressesFor,
  failedDelivery,
  type Delivery,
  type NotificationChannel,
  type OutgoingMessage,
  type Recipient,
  type SendingChannel,
} from './notification-channel.js';

/** keeps every message it is given, so tests can assert on what would have gone out */
export class MemoryChannel implements NotificationChannel {
  readonly name: SendingChannel;
  readonly sent: { to: string; message: OutgoingMessage }[] = [];
  /** addresses that fail, as a refused or unreachable send would */
  readonly failing = new Set<string>();
  /** push endpoints the push service reports as gone */
  readonly gone = new Set<string>();

  constructor(name: SendingChannel) {
    this.name = name;
  }

  supports(recipient: Recipient) {
    return addressesFor(this.name, recipient).length > 0;
  }

  async send(recipient: Recipient, message: OutgoingMessage): Promise<Delivery[]> {
    return addressesFor(this.name, recipient).map((to) => {
      if (this.gone.has(to)) return failedDelivery(to, true);
      if (this.failing.has(to)) return failedDelivery(to);
      this.sent.push({ to, message });
      return {
        to,
        status: 'sent',
        providerMessageId: `${this.name}-${this.sent.length}`,
        gone: false,
      };
    });
  }

  sentTo(to: string) {
    return this.sent.filter((s) => s.to === to).map((s) => s.message);
  }
}
