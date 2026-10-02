import { AuditAction } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { date, nullableText, objectId, oneOf, text, timestamps } from '../rules.js';

/** administrative actions, since the free database tier keeps no audit trail */
const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: AuditAction.options, required: true },
    /** the collection name of the affected document */
    targetType: { type: String, required: true, maxlength: 60 },
    targetId: { type: Schema.Types.ObjectId, required: true },
    note: { type: String, default: null, maxlength: 1000 },
    at: { type: Date, required: true, default: Date.now },
  },
  { collection: 'auditLogs', timestamps: true, autoCreate: false, autoIndex: false },
);

export const auditLogValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'AuditLog',
    required: ['userId', 'action', 'targetType', 'targetId', 'at', 'createdAt'],
    properties: {
      userId: objectId,
      action: oneOf(AuditAction.options),
      targetType: text(1, 60),
      targetId: objectId,
      note: nullableText(1000),
      at: date,
      ...timestamps,
    },
  },
};

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
