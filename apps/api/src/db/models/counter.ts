import { Schema, model, type InferSchemaType } from 'mongoose';
import { text, timestamps } from '../rules.js';

/** a numbering sequence that starts again at 1 each calendar year */
const counterSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    year: { type: Number, required: true, min: 2000, max: 9999 },
    /** the last number given out */
    seq: { type: Number, required: true, min: 1 },
  },
  { collection: 'counters', timestamps: true, autoCreate: false, autoIndex: false },
);

counterSchema.index({ name: 1 }, { unique: true });

export const counterValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Counter',
    required: ['name', 'year', 'seq', 'createdAt'],
    properties: {
      name: text(1, 60),
      year: { bsonType: 'number', minimum: 2000, maximum: 9999 },
      seq: { bsonType: 'number', minimum: 1 },
      ...timestamps,
    },
  },
};

export type CounterDoc = InferSchemaType<typeof counterSchema>;
export const CounterModel = model('Counter', counterSchema);
