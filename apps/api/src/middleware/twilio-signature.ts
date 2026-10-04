import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import twilio from 'twilio';
import { ForbiddenError } from '../errors.js';
import { publicApiUrl } from '../notifications/channel-settings.js';

export const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

export interface TwilioWebhookSettings {
  authToken: string;
  /** the address Twilio calls, such as `https://fedsa.example.org` */
  publicUrl: string;
}

/** null turns the webhooks off, and every request to them is refused */
export function twilioWebhookSettings(
  env: NodeJS.ProcessEnv,
  logger: Logger,
): TwilioWebhookSettings | null {
  const publicUrl = publicApiUrl(env);
  if (!env.TWILIO_AUTH_TOKEN || !publicUrl) {
    logger.warn(
      'Twilio webhooks refuse every request because TWILIO_AUTH_TOKEN or PUBLIC_API_URL is missing',
    );
    return null;
  }
  return { authToken: env.TWILIO_AUTH_TOKEN, publicUrl };
}

/** Twilio signs the address it called and every form field. it runs before validation drops any */
export function twilioSignature(settings: TwilioWebhookSettings | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const signature = req.get(TWILIO_SIGNATURE_HEADER);
    const signed =
      settings !== null &&
      signature !== undefined &&
      twilio.validateRequest(
        settings.authToken,
        signature,
        `${settings.publicUrl}${req.originalUrl}`,
        req.body ?? {},
      );
    if (!signed) {
      req.log.warn('refused a Twilio webhook without a valid signature');
      next(new ForbiddenError('The request is not signed by Twilio'));
      return;
    }
    next();
  };
}
