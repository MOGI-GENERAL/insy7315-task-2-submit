import type { NotificationKind, Role } from '@fedsa/contract';
import { Types } from 'mongoose';
import type { UserRepository } from '../db/index.js';
import type {
  NotificationChannel,
  OutgoingMessage,
  Recipient,
  SendingChannel,
} from '../notifications/notification-channel.js';

/** the offer workflow, where a message that arrives late loses the food */
const MIRRORED_KINDS: NotificationKind[] = ['offer_posted', 'offer_claimed', 'claim_released'];

export type StoredUser = Awaited<ReturnType<UserRepository['findActiveByIds']>>[number];

/** the screen that opens when the notification is tapped */
export function hrefFor(role: Role, kind: NotificationKind, offerId: string | null) {
  if (kind === 'certificate_issued') return role === 'donor' ? '/donor/certificates' : null;
  if (!offerId) return null;
  if (role === 'donor') return `/donor/offers/${offerId}`;
  if (role === 'recipient') return `/recipient/offers/${offerId}`;
  return null;
}

/** push shows a title above the body. SMS and WhatsApp send one block of text */
export function sentBody(channel: SendingChannel, message: OutgoingMessage) {
  return channel === 'push' ? message.body : message.phoneText;
}

export function toObjectId(id: string | null) {
  return id ? new Types.ObjectId(id) : null;
}

/** the validator requires `keys`, which the inferred type leaves optional */
export function recipientOf(user: StoredUser): Recipient {
  return {
    phone: user.phone,
    pushSubscriptions: user.pushSubscriptions.flatMap((s) =>
      s.keys ? [{ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }] : [],
    ),
  };
}

export function channelNamed(channels: NotificationChannel[], name: SendingChannel) {
  return channels.find((c) => c.name === name);
}

/**
 * the channels that reach this person besides the inbox, which every user
 * gets. WhatsApp is cheaper than SMS, so SMS is only used when WhatsApp is off
 */
export function selectChannels(
  channels: NotificationChannel[],
  mirror: boolean,
  recipient: Recipient,
  kind: NotificationKind,
): NotificationChannel[] {
  const chosen: NotificationChannel[] = [];
  const push = channelNamed(channels, 'push');
  if (push?.supports(recipient)) chosen.push(push);

  if (mirror && MIRRORED_KINDS.includes(kind)) {
    const phone = [channelNamed(channels, 'whatsapp'), channelNamed(channels, 'sms')].find((c) =>
      c?.supports(recipient),
    );
    if (phone) chosen.push(phone);
  }
  return chosen;
}
