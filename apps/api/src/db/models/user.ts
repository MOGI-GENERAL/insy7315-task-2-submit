import { Language, Role, UserStatus } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  E164_PATTERN,
  bool,
  date,
  nullableDate,
  nullableObjectId,
  nullableText,
  oneOf,
  text,
  timestamps,
} from '../rules.js';

/** the browser's push subscription, kept so the API can send web push */
const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, maxlength: 2000 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 200 },
      auth: { type: String, required: true, maxlength: 100 },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    /** null for coordinators and administrators, who belong to FEDSA */
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null },
    role: { type: String, enum: Role.options, required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    /** a length floor, so a plaintext password cannot be stored by mistake */
    passwordHash: { type: String, required: true, minlength: 20 },
    /** goes up with each new password. a session from an older one is signed out */
    passwordVersion: { type: Number, required: true, default: 0, min: 0 },
    phone: { type: String, required: true, match: new RegExp(E164_PATTERN) },
    languagePreference: { type: String, enum: Language.options, required: true },
    status: { type: String, enum: UserStatus.options, required: true, default: 'active' },
    lastLoginAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, required: true, default: false },
    /** null for accounts an administrator creates, which skip registration */
    consentedAt: { type: Date, default: null },
    consentVersion: { type: String, default: null, maxlength: 40 },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },
  },
  { collection: 'users', timestamps: true, autoCreate: false, autoIndex: false },
);

userSchema.index({ email: 1 }, { unique: true });

export const userValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'User',
    required: [
      'role',
      'fullName',
      'email',
      'passwordHash',
      'phone',
      'languagePreference',
      'status',
      'mustChangePassword',
      'createdAt',
    ],
    properties: {
      organisationId: nullableObjectId,
      role: oneOf(Role.options),
      fullName: text(1, 120),
      email: text(3, 254),
      passwordHash: { bsonType: 'string', minLength: 20 },
      passwordVersion: { bsonType: 'number', minimum: 0 },
      phone: { bsonType: 'string', pattern: E164_PATTERN },
      languagePreference: oneOf(Language.options),
      status: oneOf(UserStatus.options),
      lastLoginAt: nullableDate,
      mustChangePassword: bool,
      consentedAt: nullableDate,
      consentVersion: nullableText(40),
      pushSubscriptions: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['endpoint', 'keys'],
          properties: {
            endpoint: text(1, 2000),
            keys: {
              bsonType: 'object',
              required: ['p256dh', 'auth'],
              properties: { p256dh: text(1, 200), auth: text(1, 100) },
            },
            createdAt: date,
          },
        },
      },
      ...timestamps,
    },
  },
};

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
