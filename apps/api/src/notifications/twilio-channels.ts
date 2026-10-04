import type { DeliveryStatus } from '@fedsa/contract';
import type { Logger } from 'pino';
import twilio from 'twilio';
import {
  failedDelivery,
  type Delivery,
  type NotificationChannel,
  type OutgoingMessage,
  type Recipient,
} from './notification-channel.js';

/** what the channels need from the Twilio client, so tests can pass a fake */
export interface TwilioMessages {
  create(params: { to: string; from: string; body: string; statusCallback?: string }): Promise<{
    sid: string;
    status: string;
  }>;
}

export function twilioMessages(accountSid: string, authToken: string): TwilioMessages {
  return twilio(accountSid, authToken).messages;
}

const TWILIO_STATUS: Record<string, DeliveryStatus> = {
  accepted: 'queued',
  scheduled: 'queued',
  queued: 'queued',
  sending: 'sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',
  failed: 'failed',
  undelivered: 'failed',
  canceled: 'failed',
};

/** Twilio's message status in the four values a notification records */
export function deliveryStatusFor(twilioStatus: string): DeliveryStatus {
  return TWILIO_STATUS[twilioStatus] ?? 'sent';
}

function errorCodeOf(err: unknown) {
  if (typeof err === 'object' && err !== null && 'code' in err) return err.code;
  return null;
}

const WHATSAPP_PREFIX = 'whatsapp:';

function whatsAppAddress(phone: string) {
  return phone.startsWith(WHATSAPP_PREFIX) ? phone : `${WHATSAPP_PREFIX}${phone}`;
}

/** the number as users store it, whichever channel the message came in on */
export function phoneFromAddress(address: string) {
  const phone = address.trim();
  return phone.startsWith(WHATSAPP_PREFIX) ? phone.slice(WHATSAPP_PREFIX.length) : phone;
}

/** Twilio sends the text back to whoever wrote in, on the same channel */
export function twimlReply(text: string) {
  const response = new twilio.twiml.MessagingResponse();
  response.message(text);
  return response.toString();
}

/** SMS and WhatsApp differ only in how Twilio addresses the two ends */
class TwilioChannel implements NotificationChannel {
  readonly name: 'sms' | 'whatsapp';
  private readonly messages: TwilioMessages;
  private readonly from: string;
  private readonly logger: Logger;
  /** null when the API has no public address for Twilio to report delivery to */
  private readonly statusCallback: string | null;

  constructor(
    name: 'sms' | 'whatsapp',
    messages: TwilioMessages,
    from: string,
    logger: Logger,
    statusCallback: string | null,
  ) {
    this.name = name;
    this.messages = messages;
    this.from = from;
    this.logger = logger;
    this.statusCallback = statusCallback;
  }

  supports(recipient: Recipient) {
    return recipient.phone !== null;
  }

  async send(recipient: Recipient, message: OutgoingMessage): Promise<Delivery[]> {
    const phone = recipient.phone;
    if (!phone) return [];

    try {
      // text only. a photo would cost the recipient data and Twilio a media fee
      const sent = await this.messages.create({
        to: this.address(phone),
        from: this.address(this.from),
        body: message.phoneText,
        ...(this.statusCallback ? { statusCallback: this.statusCallback } : {}),
      });
      return [
        {
          to: phone,
          status: deliveryStatusFor(sent.status),
          providerMessageId: sent.sid,
          gone: false,
        },
      ];
    } catch (err) {
      // the error text names the phone number, so only Twilio's code is logged
      this.logger.warn(
        { channel: this.name, code: errorCodeOf(err) },
        'Twilio refused the message',
      );
      return [failedDelivery(phone)];
    }
  }

  private address(phone: string) {
    return this.name === 'whatsapp' ? whatsAppAddress(phone) : phone;
  }
}

export class TwilioSmsChannel extends TwilioChannel {
  constructor(
    messages: TwilioMessages,
    from: string,
    logger: Logger,
    statusCallback: string | null = null,
  ) {
    super('sms', messages, from, logger, statusCallback);
  }
}

export class TwilioWhatsAppChannel extends TwilioChannel {
  constructor(
    messages: TwilioMessages,
    from: string,
    logger: Logger,
    statusCallback: string | null = null,
  ) {
    super('whatsapp', messages, from, logger, statusCallback);
  }
}
