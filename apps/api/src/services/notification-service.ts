import type {
  DeliveryStatus,
  Language,
  NotificationKind,
  NotificationListResponse,
  Offer,
  PushSubscriptionRequest,
  Role,
  VapidKeyResponse,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import type { Logger } from 'pino';
import type { NotificationRepository, UserRepository } from '../db/index.js';
import { NotFoundError } from '../errors.js';
import type { ChannelSettings } from '../notifications/channel-settings.js';
import {
  addressesFor,
  failedDelivery,
  type Delivery,
  type NotificationChannel,
  type OutgoingMessage,
  type Recipient,
  type SendingChannel,
} from '../notifications/notification-channel.js';
import { offerDetails, renderMessage, type MessageData } from '../notifications/templates.js';
import type { OfferNotifier } from './offer-notifier.js';
import { notificationView } from './views.js';

/** users notified at once, so a large fan-out never opens hundreds of connections together */
const BATCH_SIZE = 20;

/** NFR01 asks for every eligible recipient within a minute of posting */
const FAN_OUT_TARGET_MS = 60_000;

/** the offer workflow, where a message that arrives late loses the food */
const MIRRORED_KINDS: NotificationKind[] = ['offer_posted', 'offer_claimed', 'claim_released'];

const INBOX_SIZE = 50;

/** a user rarely has more than a phone and a laptop */
const MAX_PUSH_SUBSCRIPTIONS = 10;

type StoredUser = Awaited<ReturnType<UserRepository['findActiveByIds']>>[number];

export interface NotificationSettings extends ChannelSettings {
  logger: Logger;
}

interface FanOutResult {
  users: number;
  rows: number;
  failed: number;
}

/** the screen that opens when the notification is tapped */
function hrefFor(role: Role, offerId: string | null) {
  if (!offerId) return null;
  if (role === 'donor') return `/donor/offers/${offerId}`;
  if (role === 'recipient') return `/recipient/offers/${offerId}`;
  return null;
}

/** push shows a title above the body. SMS and WhatsApp send one block of text */
function sentBody(channel: SendingChannel, message: OutgoingMessage) {
  return channel === 'push' ? message.body : message.phoneText;
}

function toObjectId(id: string | null) {
  return id ? new Types.ObjectId(id) : null;
}

/** the validator requires `keys`, which the inferred type leaves optional */
function recipientOf(user: StoredUser): Recipient {
  return {
    phone: user.phone,
    pushSubscriptions: user.pushSubscriptions.flatMap((s) =>
      s.keys ? [{ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }] : [],
    ),
  };
}

export class NotificationService implements OfferNotifier {
  private readonly notifications: NotificationRepository;
  private readonly users: UserRepository;
  private readonly channels: NotificationChannel[];
  private readonly mirror: boolean;
  private readonly vapidPublicKey: string | null;
  private readonly logger: Logger;
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    notifications: NotificationRepository,
    users: UserRepository,
    settings: NotificationSettings,
  ) {
    this.notifications = notifications;
    this.users = users;
    this.channels = settings.channels;
    this.mirror = settings.mirror;
    this.vapidPublicKey = settings.vapidPublicKey;
    this.logger = settings.logger;
  }

  /** NFR01 is measured from the moment the offer was saved to the last row written */
  notifyEligible(offer: Offer, recipientOrganisationIds: string[]) {
    return this.track(async () => {
      const users = await this.users.findActiveInOrganisations(recipientOrganisationIds);
      const result = await this.fanOut(users, 'offer_posted', offerDetails(offer), offer.id);
      const durationMs = Date.now() - Date.parse(offer.createdAt);
      const summary = {
        offerId: offer.id,
        organisations: recipientOrganisationIds.length,
        ...result,
        durationMs,
      };
      if (durationMs > FAN_OUT_TARGET_MS) {
        this.logger.warn(summary, 'offer fan-out took longer than a minute');
      } else {
        this.logger.info(summary, 'offer fan-out finished');
      }
    });
  }

  notifyUsers<K extends NotificationKind>(
    userIds: string[],
    kind: K,
    data: MessageData[K],
    offerId: string | null = null,
  ) {
    return this.track(async () => {
      const users = await this.users.findActiveByIds(userIds);
      return this.fanOut(users, kind, data, offerId);
    });
  }

  /** every active user of each organisation */
  notifyOrganisations<K extends NotificationKind>(
    organisationIds: string[],
    kind: K,
    data: MessageData[K],
    offerId: string | null = null,
  ) {
    return this.track(async () => {
      const users = await this.users.findActiveInOrganisations(organisationIds);
      return this.fanOut(users, kind, data, offerId);
    });
  }

  /** for a phone with no account behind it, such as a driver's. no WhatsApp and no inbox */
  sendSms<K extends NotificationKind>(
    to: string,
    kind: K,
    data: MessageData[K],
    offerId: string | null = null,
    language: Language = 'en',
  ): Promise<DeliveryStatus> {
    return this.track(async () => {
      const rendered = renderMessage(kind, language, data);
      const message = { ...rendered, href: null };
      const recipient: Recipient = { phone: to, pushSubscriptions: [] };
      const sms = this.channel('sms');
      if (!sms) this.logger.warn({ kind }, 'SMS is off, so the message was recorded as failed');

      const [delivery] = sms ? await this.sendSafely(sms, recipient, message) : [];
      const status = delivery?.status ?? 'failed';
      await this.notifications.create({
        organisationId: null,
        userId: null,
        to,
        offerId: toObjectId(offerId),
        kind,
        channel: 'sms',
        title: message.title,
        body: message.phoneText,
        href: null,
        deliveryStatus: status,
        providerMessageId: delivery?.providerMessageId ?? null,
        sentAt: status === 'failed' ? null : new Date(),
      });
      return status;
    });
  }

  /**
   * the channels that reach this person besides the inbox, which every user
   * gets. WhatsApp is cheaper than SMS, so SMS is only used when WhatsApp is off
   */
  selectChannel(recipient: Recipient, kind: NotificationKind): NotificationChannel[] {
    const chosen: NotificationChannel[] = [];
    const push = this.channel('push');
    if (push?.supports(recipient)) chosen.push(push);

    if (this.mirror && MIRRORED_KINDS.includes(kind)) {
      const phone = [this.channel('whatsapp'), this.channel('sms')].find((c) =>
        c?.supports(recipient),
      );
      if (phone) chosen.push(phone);
    }
    return chosen;
  }

  async listForUser(userId: string): Promise<NotificationListResponse> {
    const [items, unread] = await Promise.all([
      this.notifications.inbox(userId, INBOX_SIZE),
      this.notifications.countUnread(userId),
    ]);
    return { items: items.map(notificationView), unread };
  }

  /** another user's notification looks missing */
  async markRead(userId: string, id: string) {
    const notification = await this.notifications.findInInbox(id, userId);
    if (!notification) throw new NotFoundError();
    await this.notifications.markRead(notification._id);
  }

  /** a shared phone has one subscription, so it moves to whoever subscribed last */
  async addPushSubscription(userId: string, input: PushSubscriptionRequest) {
    await this.users.removePushEndpointFromEveryone(input.endpoint);
    await this.users.addPushSubscription(
      userId,
      { endpoint: input.endpoint, keys: input.keys },
      MAX_PUSH_SUBSCRIPTIONS,
    );
  }

  async removePushSubscription(userId: string, endpoint: string) {
    await this.users.removePushSubscription(userId, endpoint);
  }

  publicKey(): VapidKeyResponse {
    if (!this.vapidPublicKey) throw new NotFoundError('Push notifications are switched off');
    return { vapidPublicKey: this.vapidPublicKey };
  }

  /** resolves once everything started so far has finished, so tests need not sleep */
  async whenIdle() {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  private track<T>(work: () => Promise<T>): Promise<T> {
    const promise = work();
    this.running.add(promise);
    const done = () => this.running.delete(promise);
    promise.then(done, done);
    return promise;
  }

  private channel(name: SendingChannel) {
    return this.channels.find((c) => c.name === name);
  }

  /** one user's failure is logged and counted, and the rest carry on */
  private async fanOut<K extends NotificationKind>(
    users: StoredUser[],
    kind: K,
    data: MessageData[K],
    offerId: string | null,
  ): Promise<FanOutResult> {
    const result: FanOutResult = { users: users.length, rows: 0, failed: 0 };

    for (let start = 0; start < users.length; start += BATCH_SIZE) {
      const batch = users.slice(start, start + BATCH_SIZE);
      const outcomes = await Promise.allSettled(
        batch.map((user) => this.deliver(user, kind, data, offerId)),
      );
      outcomes.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          result.rows += outcome.value.length;
          result.failed += outcome.value.filter((status) => status === 'failed').length;
        } else {
          result.failed += 1;
          this.logger.error(
            { err: outcome.reason, userId: batch[i]!._id.toString(), kind },
            'notifying a user failed',
          );
        }
      });
    }
    return result;
  }

  /** the inbox row comes first, so the user sees it even if every other channel fails */
  private async deliver<K extends NotificationKind>(
    user: StoredUser,
    kind: K,
    data: MessageData[K],
    offerId: string | null,
  ): Promise<DeliveryStatus[]> {
    const rendered = renderMessage(kind, user.languagePreference, data);
    const message: OutgoingMessage = { ...rendered, href: hrefFor(user.role, offerId) };
    const row = {
      organisationId: user.organisationId,
      userId: user._id,
      offerId: toObjectId(offerId),
      kind,
      title: message.title,
      href: message.href,
    };

    await this.notifications.create({
      ...row,
      channel: 'in_app',
      to: null,
      body: message.body,
      deliveryStatus: 'delivered',
      sentAt: new Date(),
    });
    const statuses: DeliveryStatus[] = ['delivered'];

    const recipient = recipientOf(user);
    for (const channel of this.selectChannel(recipient, kind)) {
      for (const delivery of await this.sendSafely(channel, recipient, message)) {
        await this.notifications.create({
          ...row,
          channel: channel.name,
          to: delivery.to,
          body: sentBody(channel.name, message),
          deliveryStatus: delivery.status,
          providerMessageId: delivery.providerMessageId,
          sentAt: delivery.status === 'failed' ? null : new Date(),
        });
        statuses.push(delivery.status);
        if (delivery.gone) await this.users.removePushSubscription(user._id, delivery.to);
      }
    }
    return statuses;
  }

  /** a channel that throws despite its contract still leaves a failed row for each address */
  private async sendSafely(
    channel: NotificationChannel,
    recipient: Recipient,
    message: OutgoingMessage,
  ): Promise<Delivery[]> {
    try {
      return await channel.send(recipient, message);
    } catch (err) {
      this.logger.error({ err, channel: channel.name }, 'a notification channel failed');
      return addressesFor(channel.name, recipient).map((to) => failedDelivery(to));
    }
  }
}
