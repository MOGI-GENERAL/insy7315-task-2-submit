import { z } from 'zod';
import { Notification } from './entities.js';

export const NotificationListResponse = z.object({
  items: z.array(Notification),
  unread: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponse>;

/** parse only after the Twilio signature check, which needs every original field */
export const TwilioInboundBody = z.object({
  MessageSid: z.string(),
  From: z.string(),
  Body: z.string().max(1600),
});
export type TwilioInboundBody = z.infer<typeof TwilioInboundBody>;

export const TwilioStatusBody = z.object({
  MessageSid: z.string(),
  MessageStatus: z.string(),
});
export type TwilioStatusBody = z.infer<typeof TwilioStatusBody>;
