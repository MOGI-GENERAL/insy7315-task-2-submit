import type { DeliveryStatus, NotificationKind } from '@fedsa/contract';
import type { Logger } from 'pino';
import type { NotificationRepository, UserRepository } from '../db/index.js';
import {
  addressesFor,
  failedDelivery,
  type Delivery,
  type NotificationChannel,
  type OutgoingMessage,
  type Recipient,
} from '../notifications/notification-channel.js';
import { renderMessage, type MessageData } from '../notifications/templates.js';
import {
  hrefFor,
  recipientOf,
  selectChannels,
  sentBody,
  toObjectId,
  type StoredUser,
} from './notification-recipient.js';

/** users notified at once, so a large fan-out never opens hundreds of connections together */
const BATCH_SIZE = 20;

export interface FanOutResult {
  users: number;
  rows: number;
  failed: number;
}

/** one user's failure is logged and counted, and the rest carry on */
export async function fanOut<K extends NotificationKind>(
  notifications: NotificationRepository,
  userRepository: UserRepository,
  channels: NotificationChannel[],
  mirror: boolean,
  logger: Logger,
  users: StoredUser[],
  kind: K,
  data: MessageData[K],
  offerId: string | null,
): Promise<FanOutResult> {
  const result: FanOutResult = { users: users.length, rows: 0, failed: 0 };

  for (let start = 0; start < users.length; start += BATCH_SIZE) {
    const batch = users.slice(start, start + BATCH_SIZE);
    const outcomes = await Promise.allSettled(
      batch.map((user) =>
        deliver(notifications, userRepository, channels, mirror, logger, user, kind, data, offerId),
      ),
    );
    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        result.rows += outcome.value.length;
        result.failed += outcome.value.filter((status) => status === 'failed').length;
      } else {
        result.failed += 1;
        logger.error(
          { err: outcome.reason, userId: batch[i]!._id.toString(), kind },
          'notifying a user failed',
        );
      }
    });
  }
  return result;
}

/** the inbox row comes first, so the user sees it even if every other channel fails */
async function deliver<K extends NotificationKind>(
  notifications: NotificationRepository,
  userRepository: UserRepository,
  channels: NotificationChannel[],
  mirror: boolean,
  logger: Logger,
  user: StoredUser,
  kind: K,
  data: MessageData[K],
  offerId: string | null,
): Promise<DeliveryStatus[]> {
  const rendered = renderMessage(kind, user.languagePreference, data);
  const message: OutgoingMessage = { ...rendered, href: hrefFor(user.role, kind, offerId) };
  const row = {
    organisationId: user.organisationId,
    userId: user._id,
    offerId: toObjectId(offerId),
    kind,
    title: message.title,
    href: message.href,
  };

  await notifications.create({
    ...row,
    channel: 'in_app',
    to: null,
    body: message.body,
    deliveryStatus: 'delivered',
    sentAt: new Date(),
  });
  const statuses: DeliveryStatus[] = ['delivered'];

  const recipient = recipientOf(user);
  for (const channel of selectChannels(channels, mirror, recipient, kind)) {
    for (const delivery of await sendSafely(logger, channel, recipient, message)) {
      await notifications.create({
        ...row,
        channel: channel.name,
        to: delivery.to,
        body: sentBody(channel.name, message),
        deliveryStatus: delivery.status,
        providerMessageId: delivery.providerMessageId,
        sentAt: delivery.status === 'failed' ? null : new Date(),
      });
      statuses.push(delivery.status);
      if (delivery.gone) await userRepository.removePushSubscription(user._id, delivery.to);
    }
  }
  return statuses;
}

/** a channel that throws despite its contract still leaves a failed row for each address */
export async function sendSafely(
  logger: Logger,
  channel: NotificationChannel,
  recipient: Recipient,
  message: OutgoingMessage,
): Promise<Delivery[]> {
  try {
    return await channel.send(recipient, message);
  } catch (err) {
    logger.error({ err, channel: channel.name }, 'a notification channel failed');
    return addressesFor(channel.name, recipient).map((to) => failedDelivery(to));
  }
}
