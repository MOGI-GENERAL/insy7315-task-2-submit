import type { Logger } from 'pino';
import { hideDriverToken } from '../logger.js';
import {
  addressesFor,
  type Delivery,
  type NotificationChannel,
  type OutgoingMessage,
  type Recipient,
  type SendingChannel,
} from './notification-channel.js';

/** logs the text instead of sending it, for local development without provider accounts */
export class ConsoleChannel implements NotificationChannel {
  readonly name: SendingChannel;
  private readonly logger: Logger;

  constructor(name: SendingChannel, logger: Logger) {
    this.name = name;
    this.logger = logger;
  }

  supports(recipient: Recipient) {
    return addressesFor(this.name, recipient).length > 0;
  }

  async send(recipient: Recipient, message: OutgoingMessage): Promise<Delivery[]> {
    return addressesFor(this.name, recipient).map((to) => {
      // the address is left out of the log, because a phone number is personal information
      this.logger.info(
        {
          channel: this.name,
          text: hideDriverToken(this.name === 'push' ? message.body : message.phoneText),
        },
        'notification logged, not sent',
      );
      return { to, status: 'sent', providerMessageId: null, gone: false };
    });
  }
}
