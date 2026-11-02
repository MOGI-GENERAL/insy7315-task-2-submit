import type {
  Claim,
  DeliveryStatus,
  Language,
  NotificationKind,
  NotificationListResponse,
  Offer,
  PushSubscriptionRequest,
  VapidKeyResponse,
} from '@fedsa/contract';
import type { Logger } from 'pino';
import type { NotificationRepository, UserRepository } from '../db/index.js';
import { NotFoundError } from '../errors.js';
import type { ChannelSettings } from '../notifications/channel-settings.js';
import type {
  NotificationChannel,
  Recipient,
  SendingChannel,
} from '../notifications/notification-channel.js';
import { hideDriverToken } from '../logger.js';
import { offerDetails, renderMessage, type MessageData } from '../notifications/templates.js';
import type { ClaimNotifier } from './claim-notifier.js';
import { fanOut, sendSafely, type FanOutResult } from './notification-fan-out.js';
import {
  channelNamed,
  selectChannels,
  toObjectId,
  type StoredUser,
} from './notification-recipient.js';
import type { OfferNotifier } from './offer-notifier.js';
import { notificationView } from './views.js';

/** NFR01 asks for every eligible recipient within a minute of posting */
const FAN_OUT_TARGET_MS = 60_000;

const INBOX_SIZE = 50;

/** a user rarely has more than a phone and a laptop */
const MAX_PUSH_SUBSCRIPTIONS = 10;

export interface NotificationSettings extends ChannelSettings {
  logger: Logger;
}

export class NotificationService implements OfferNotifier, ClaimNotifier {
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

  /** timed from its own start, because a re-notify after a release sends an offer saved long ago */
  notifyEligible(offer: Offer, recipientOrganisationIds: string[]) {
    return this.track(async () => {
      const started = Date.now();
      const users = await this.users.findActiveInOrganisations(recipientOrganisationIds);
      const result = await this.fanOut(users, 'offer_posted', offerDetails(offer), offer.id);
      const durationMs = Date.now() - started;
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

  /** the recipients told it has gone are the ones it was sent to, read back from the stored rows */
  notifyClaimed(offer: Offer, claim: Claim) {
    return this.track(async () => {
      const notified = await this.notifications.organisationsNotifiedAbout(offer.id);
      const others = notified.filter(
        (id) => id !== claim.recipientOrganisationId && id !== offer.donorOrganisationId,
      );
      const details = offerDetails(offer);
      await Promise.all([
        this.notifyOrganisations(
          [offer.donorOrganisationId],
          'offer_claimed',
          { ...details, claimedBy: claim.recipient.name },
          offer.id,
        ),
        this.notifyOrganisations(others, 'offer_claimed', details, offer.id),
      ]);
    });
  }

  notifyReleased(offer: Offer, claim: Claim) {
    return this.track(async () => {
      await this.notifyOrganisations(
        [offer.donorOrganisationId],
        'claim_released',
        { ...offerDetails(offer), releasedBy: claim.recipient.name },
        offer.id,
      );
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

      const [delivery] = sms ? await sendSafely(this.logger, sms, recipient, message) : [];
      const status = delivery?.status ?? 'failed';
      await this.notifications.create({
        organisationId: null,
        userId: null,
        to,
        offerId: toObjectId(offerId),
        kind,
        channel: 'sms',
        title: message.title,
        body: hideDriverToken(message.phoneText),
        href: null,
        deliveryStatus: status,
        providerMessageId: delivery?.providerMessageId ?? null,
        sentAt: status === 'failed' ? null : new Date(),
      });
      return status;
    });
  }

  selectChannel(recipient: Recipient, kind: NotificationKind): NotificationChannel[] {
    return selectChannels(this.channels, this.mirror, recipient, kind);
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
    return channelNamed(this.channels, name);
  }

  private fanOut<K extends NotificationKind>(
    users: StoredUser[],
    kind: K,
    data: MessageData[K],
    offerId: string | null,
  ): Promise<FanOutResult> {
    return fanOut(
      this.notifications,
      this.users,
      this.channels,
      this.mirror,
      this.logger,
      users,
      kind,
      data,
      offerId,
    );
  }
}
