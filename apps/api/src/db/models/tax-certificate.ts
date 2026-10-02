import { FoodCategory } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { date, nullableText, objectId, oneOf, text, timestamps } from '../rules.js';

const valuationLineSchema = new Schema(
  {
    category: { type: String, enum: FoodCategory.options, required: true },
    quantityKg: { type: Number, required: true, min: 0 },
    ratePerKg: { type: Number, required: true, min: 0 },
    value: { type: Number, required: true, min: 0 },
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
  },
  { collection: 'taxCertificates', timestamps: true, autoCreate: false, autoIndex: false },
);

taxCertificateSchema.index({ certificateNumber: 1 }, { unique: true });

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
      ...timestamps,
    },
  },
};

export type TaxCertificateDoc = InferSchemaType<typeof taxCertificateSchema>;
export const TaxCertificateModel = model('TaxCertificate', taxCertificateSchema);
