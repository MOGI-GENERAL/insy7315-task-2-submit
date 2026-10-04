import { DeliveryStatus, NotificationChannel, NotificationKind } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { nullableDate, nullableObjectId, nullableText, oneOf, text, timestamps } from '../rules.js';

/**
 * one row per message sent, on whichever channel was used. a driver's SMS
 * has no user or organisation, only the phone number in `to`
 */
const notificationSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    to: { type: String, default: null, maxlength: 2000 },
    offerId: { type: Schema.Types.ObjectId, ref: 'Offer', default: null },
    kind: { type: String, enum: NotificationKind.options, required: true },
    channel: { type: String, enum: NotificationChannel.options, required: true },
    /** rendered in the user's language at send time and stored as sent */
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1600 },
    href: { type: String, default: null, maxlength: 500 },
    sentAt: { type: Date, default: null },
    deliveryStatus: {
      type: String,
      enum: DeliveryStatus.options,
      required: true,
      default: 'queued',
    },
    /** Twilio's message id, for reconciling the bill */
    providerMessageId: { type: String, default: null, maxlength: 100 },
    readAt: { type: Date, default: null },
  },
  { collection: 'notifications', timestamps: true, autoCreate: false, autoIndex: false },
);

notificationSchema.index({ offerId: 1 });
notificationSchema.index({ userId: 1, channel: 1, createdAt: -1 });
/**
 * a sparse index would still keep the null that every in-app row stores. `$gt`
 * matches strings only, and unlike `$type` a lookup by one id can use it
 */
notificationSchema.index(
  { providerMessageId: 1 },
  { partialFilterExpression: { providerMessageId: { $gt: '' } } },
);

export const notificationValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Notification',
    required: ['kind', 'channel', 'title', 'body', 'deliveryStatus', 'createdAt'],
    properties: {
      organisationId: nullableObjectId,
      userId: nullableObjectId,
      to: nullableText(2000),
      offerId: nullableObjectId,
      kind: oneOf(NotificationKind.options),
      channel: oneOf(NotificationChannel.options),
      title: text(1, 200),
      body: text(1, 1600),
      href: nullableText(500),
      sentAt: nullableDate,
      deliveryStatus: oneOf(DeliveryStatus.options),
      providerMessageId: nullableText(100),
      readAt: nullableDate,
      ...timestamps,
    },
  },
};

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model('Notification', notificationSchema);
