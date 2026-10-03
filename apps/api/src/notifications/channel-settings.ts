import type { Logger } from 'pino';
import { ConsoleChannel } from './console-channel.js';
import type { NotificationChannel } from './notification-channel.js';
import {
  TwilioSmsChannel,
  TwilioWhatsAppChannel,
  twilioMessages,
  type TwilioMessages,
} from './twilio-channels.js';
import { WebPushChannel, vapidSender } from './web-push-channel.js';

const KNOWN_CHANNELS = ['push', 'whatsapp', 'sms', 'console'];

export interface ChannelSettings {
  /** in the order the service prefers them */
  channels: NotificationChannel[];
  mirror: boolean;
  /** null while push is off */
  vapidPublicKey: string | null;
}

function twilioClient(env: NodeJS.ProcessEnv, logger: Logger): TwilioMessages | null {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  try {
    return twilioMessages(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    logger.warn({ err }, 'the Twilio settings were not accepted');
    return null;
  }
}

/**
 * a channel is on when NOTIFY_CHANNELS lists it and its settings are all
 * present. anything missing turns that channel off rather than stopping the API
 */
export function channelSettings(env: NodeJS.ProcessEnv, logger: Logger): ChannelSettings {
  const requested = (env.NOTIFY_CHANNELS ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  for (const name of requested) {
    if (!KNOWN_CHANNELS.includes(name)) {
      logger.warn({ channel: name }, 'NOTIFY_CHANNELS names an unknown channel');
    }
  }

  const channels: NotificationChannel[] = [];
  let vapidPublicKey: string | null = null;

  if (requested.includes('push')) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
      const sender = vapidSender({
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
        subject: VAPID_SUBJECT,
      });
      channels.push(new WebPushChannel(sender, logger));
      vapidPublicKey = VAPID_PUBLIC_KEY;
    } else {
      logger.warn('push is off because a VAPID setting is missing');
    }
  }

  const wantsTwilio = requested.includes('whatsapp') || requested.includes('sms');
  const twilio = wantsTwilio ? twilioClient(env, logger) : null;

  if (requested.includes('whatsapp')) {
    if (twilio && env.TWILIO_WHATSAPP_FROM) {
      channels.push(new TwilioWhatsAppChannel(twilio, env.TWILIO_WHATSAPP_FROM, logger));
    } else {
      logger.warn('WhatsApp is off because a Twilio setting is missing');
    }
  }

  if (requested.includes('sms')) {
    if (twilio && env.TWILIO_SMS_FROM) {
      channels.push(new TwilioSmsChannel(twilio, env.TWILIO_SMS_FROM, logger));
    } else {
      logger.warn('SMS is off because a Twilio setting is missing');
    }
  }

  // listed last, so a real SMS channel is always chosen ahead of it
  if (requested.includes('console')) channels.push(new ConsoleChannel('sms', logger));

  const mirror = (env.NOTIFY_MIRROR ?? '').trim().toLowerCase() !== 'false';
  logger.info({ channels: channels.map((c) => c.name), mirror }, 'notification channels ready');
  return { channels, mirror, vapidPublicKey };
}
