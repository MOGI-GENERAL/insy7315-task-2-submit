import { OrganisationStatus, OrganisationType } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  E164_PATTERN,
  MAX_QUANTITY_KG,
  bool,
  nullableDate,
  nullableObjectId,
  nullableText,
  oneOf,
  text,
  timestamps,
} from '../rules.js';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    /** longitude first, as GeoJSON requires */
    coordinates: {
      type: [Number],
      required: true,
      validate: (v: number[]) => v.length === 2,
    },
  },
  { _id: false },
);

const isRecipient = function (this: { type?: string }) {
  return this.type === 'recipient';
};

const organisationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: OrganisationType.options, required: true },
    status: { type: String, enum: OrganisationStatus.options, required: true },
    addressLine: { type: String, required: true, trim: true, maxlength: 120 },
    suburb: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: pointSchema, required: true },
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactPhone: { type: String, required: true, match: new RegExp(E164_PATTERN) },
    contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    verifiedAt: { type: Date, default: null },
    verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    capacityNotes: { type: String, default: '', maxlength: 1000 },

    storageAmbient: { type: Boolean, required: isRecipient },
    storageRefrigerated: { type: Boolean, required: isRecipient },
    storageFrozen: { type: Boolean, required: isRecipient },
    /** null means no limit */
    maxCapacityKg: { type: Number, default: null, min: 0, max: MAX_QUANTITY_KG },
    hasTransport: { type: Boolean, required: isRecipient },
    mealsPerDay: { type: Number, default: null, min: 0 },

    taxReferenceNumber: { type: String, default: null, maxlength: 40 },
  },
  { collection: 'organisations', timestamps: true, autoCreate: false, autoIndex: false },
);

/** matching looks for recipients near the donor */
organisationSchema.index({ location: '2dsphere' });

export const organisationValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Organisation',
    required: [
      'name',
      'type',
      'status',
      'addressLine',
      'suburb',
      'city',
      'location',
      'contactName',
      'contactPhone',
      'contactEmail',
      'createdAt',
    ],
    properties: {
      name: text(1, 120),
      type: oneOf(OrganisationType.options),
      status: oneOf(OrganisationStatus.options),
      addressLine: text(1, 120),
      suburb: text(1, 120),
      city: text(1, 120),
      location: {
        bsonType: 'object',
        required: ['type', 'coordinates'],
        properties: {
          type: { enum: ['Point'] },
          coordinates: {
            bsonType: 'array',
            minItems: 2,
            maxItems: 2,
            items: { bsonType: 'number' },
          },
        },
      },
      contactName: text(1, 120),
      contactPhone: { bsonType: 'string', pattern: E164_PATTERN },
      contactEmail: text(3, 254),
      verifiedAt: nullableDate,
      verifiedByUserId: nullableObjectId,
      capacityNotes: { bsonType: 'string', maxLength: 1000 },
      storageAmbient: bool,
      storageRefrigerated: bool,
      storageFrozen: bool,
      maxCapacityKg: { bsonType: ['number', 'null'], minimum: 0, maximum: MAX_QUANTITY_KG },
      hasTransport: bool,
      mealsPerDay: { bsonType: ['number', 'null'], minimum: 0 },
      taxReferenceNumber: nullableText(40),
      ...timestamps,
    },
  },
};

export type OrganisationDoc = InferSchemaType<typeof organisationSchema>;
export const OrganisationModel = model('Organisation', organisationSchema);
