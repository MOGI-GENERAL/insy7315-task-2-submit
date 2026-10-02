import { FoodCategory } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { nullableObjectId, oneOf, timestamps } from '../rules.js';

/** rand per kilogram for each food category, used to value tax certificates */
const valuationRateSchema = new Schema(
  {
    category: { type: String, enum: FoodCategory.options, required: true },
    ratePerKg: { type: Number, required: true, min: 0, max: 10000 },
    /** null marks a seeded placeholder rate rather than a real figure */
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'valuationRates', timestamps: true, autoCreate: false, autoIndex: false },
);

valuationRateSchema.index({ category: 1 }, { unique: true });

export const valuationRateValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'ValuationRate',
    required: ['category', 'ratePerKg', 'createdAt'],
    properties: {
      category: oneOf(FoodCategory.options),
      ratePerKg: { bsonType: 'number', minimum: 0, maximum: 10000 },
      updatedByUserId: nullableObjectId,
      ...timestamps,
    },
  },
};

export type ValuationRateDoc = InferSchemaType<typeof valuationRateSchema>;
export const ValuationRateModel = model('ValuationRate', valuationRateSchema);
