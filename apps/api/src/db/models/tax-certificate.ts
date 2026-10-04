import { FoodCategory } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { bool, date, nullableText, objectId, oneOf, text, timestamps } from '../rules.js';

const valuationLineSchema = new Schema(
  {
    category: { type: String, enum: FoodCategory.options, required: true },
    quantityKg: { type: Number, required: true, min: 0 },
    ratePerKg: { type: Number, required: true, min: 0 },
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/** the donor as it stood at issue. a later profile edit never reaches the PDF */
const donorSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    addressLine: { type: String, required: true, maxlength: 120 },
    suburb: { type: String, required: true, maxlength: 120 },
    taxReferenceNumber: { type: String, default: null, maxlength: 40 },
  },
  { _id: false },
);

/**
 * the handover ids are stored rather than recomputed, so a reissued
 * certificate always matches the original
 */
const taxCertificateSchema = new Schema(
  {
    donorOrganisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    handoverRecordIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'HandoverRecord' }],
      required: true,
      validate: (v: unknown[]) => v.length >= 1,
    },
    totalQuantityKg: { type: Number, required: true, min: 0 },
    valuationByCategory: { type: [valuationLineSchema], required: true },
    /** rand */
    totalValue: { type: Number, required: true, min: 0 },
    certificateNumber: { type: String, required: true, trim: true, maxlength: 40 },
    issuedAt: { type: Date, required: true, default: Date.now },
    documentUrl: { type: String, default: null, maxlength: 2000 },
    donor: { type: donorSnapshotSchema, required: true },
    /** true if any line was valued at a rate no administrator had set yet */
    placeholderRates: { type: Boolean, required: true },
  },
  { collection: 'taxCertificates', timestamps: true, autoCreate: false, autoIndex: false },
);

taxCertificateSchema.index({ certificateNumber: 1 }, { unique: true });
/** no handover can appear on two certificates */
taxCertificateSchema.index({ handoverRecordIds: 1 }, { unique: true });

const amount = { bsonType: 'number', minimum: 0 };

export const taxCertificateValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'TaxCertificate',
    required: [
      'donorOrganisationId',
      'periodStart',
      'periodEnd',
      'handoverRecordIds',
      'totalQuantityKg',
      'valuationByCategory',
      'totalValue',
      'certificateNumber',
      'issuedAt',
      'donor',
      'placeholderRates',
      'createdAt',
    ],
    properties: {
      donorOrganisationId: objectId,
      periodStart: date,
      periodEnd: date,
      handoverRecordIds: { bsonType: 'array', minItems: 1, items: objectId },
      totalQuantityKg: amount,
      valuationByCategory: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['category', 'quantityKg', 'ratePerKg', 'value'],
          properties: {
            category: oneOf(FoodCategory.options),
            quantityKg: amount,
            ratePerKg: amount,
            value: amount,
          },
        },
      },
      totalValue: amount,
      certificateNumber: text(1, 40),
      issuedAt: date,
      documentUrl: nullableText(2000),
      donor: {
        bsonType: 'object',
        required: ['name', 'addressLine', 'suburb'],
        properties: {
          name: text(1, 120),
          addressLine: text(1, 120),
          suburb: text(1, 120),
          taxReferenceNumber: nullableText(40),
        },
      },
      placeholderRates: bool,
      ...timestamps,
    },
  },
};

export type TaxCertificateDoc = InferSchemaType<typeof taxCertificateSchema>;
export const TaxCertificateModel = model('TaxCertificate', taxCertificateSchema);
