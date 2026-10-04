import { isDeepStrictEqual } from 'node:util';
import mongoose, { type Model } from 'mongoose';
import { auditLogValidator, AuditLogModel } from './models/audit-log.js';
import { claimValidator, ClaimModel } from './models/claim.js';
import { collectionValidator, CollectionModel } from './models/collection.js';
import { counterValidator, CounterModel } from './models/counter.js';
import { handoverRecordValidator, HandoverRecordModel } from './models/handover-record.js';
import { notificationValidator, NotificationModel } from './models/notification.js';
import { offerValidator, OfferModel } from './models/offer.js';
import { organisationValidator, OrganisationModel } from './models/organisation.js';
import { taxCertificateValidator, TaxCertificateModel } from './models/tax-certificate.js';
import { userValidator, UserModel } from './models/user.js';
import { valuationRateValidator, ValuationRateModel } from './models/valuation-rate.js';

export interface ManagedCollection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  validator: object;
}

/**
 * only these collections are touched. collections that other components
 * own, such as the session store's, keep whatever indexes they create
 */
export const MANAGED: ManagedCollection[] = [
  { model: OrganisationModel, validator: organisationValidator },
  { model: UserModel, validator: userValidator },
  { model: OfferModel, validator: offerValidator },
  { model: ClaimModel, validator: claimValidator },
  { model: CollectionModel, validator: collectionValidator },
  { model: HandoverRecordModel, validator: handoverRecordValidator },
  { model: NotificationModel, validator: notificationValidator },
  { model: TaxCertificateModel, validator: taxCertificateValidator },
  { model: AuditLogModel, validator: auditLogValidator },
  { model: ValuationRateModel, validator: valuationRateValidator },
  { model: CounterModel, validator: counterValidator },
];

const VALIDATION = { validationLevel: 'strict', validationAction: 'error' } as const;

export interface BootstrapResult {
  createdCollections: string[];
  updatedValidators: string[];
  createdIndexes: string[];
  droppedIndexes: string[];
}

/**
 * creates each collection with its validator, or updates the validator if it
 * has changed, then brings the indexes in line with the models. needs an open
 * default mongoose connection, and a second run changes nothing
 */
export async function bootstrapDb(): Promise<BootstrapResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('bootstrapDb needs an open database connection');

  const result: BootstrapResult = {
    createdCollections: [],
    updatedValidators: [],
    createdIndexes: [],
    droppedIndexes: [],
  };
  const existing = await db.listCollections().toArray();

  for (const { model, validator } of MANAGED) {
    const name = model.collection.collectionName;
    const found = existing.find((c) => c.name === name);

    if (!found) {
      await db.createCollection(name, { validator, ...VALIDATION });
      result.createdCollections.push(name);
    } else {
      const options = 'options' in found ? found.options : undefined;
      const current = {
        validator: options?.validator,
        validationLevel: options?.validationLevel,
        validationAction: options?.validationAction,
      };
      if (!isDeepStrictEqual(current, { validator, ...VALIDATION })) {
        await db.command({ collMod: name, validator, ...VALIDATION });
        result.updatedValidators.push(name);
      }
    }

    const before = await indexNames(model);
    const dropped = await model.syncIndexes();
    const after = await indexNames(model);
    result.droppedIndexes.push(...dropped.map((index) => `${name}.${index}`));
    result.createdIndexes.push(
      ...after.filter((index) => !before.includes(index)).map((index) => `${name}.${index}`),
    );
  }

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function indexNames(model: Model<any>): Promise<string[]> {
  const indexes: { name: string }[] = await model.listIndexes();
  return indexes.map((index) => index.name);
}
