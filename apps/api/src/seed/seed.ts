import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { MANAGED, SESSIONS_COLLECTION, UserRepository, bootstrapDb } from '../db/index.js';
import { hashPassword } from '../services/user-service.js';
import { buildRecords, type SeedDoc, type SeedRecords } from './records.js';
import { NADIA } from './scenario.js';

export class SeedRefusedError extends Error {}

export interface SeedOptions {
  password: string;
  /** empties every collection the API owns first, records the seed did not write included */
  reset?: boolean;
  now?: Date;
}

export interface CollectionResult {
  name: string;
  total: number;
  inserted: number;
  updated: number;
  deleted: number;
}

const MINUTE = 60_000;

/** reuses the stored hash while the password is unchanged. a second run then rewrites nothing */
async function passwordHashFor(password: string) {
  const existing = await new UserRepository().findByEmail(NADIA.email);
  if (existing && (await bcrypt.compare(password, existing.passwordHash))) {
    return existing.passwordHash;
  }
  return hashPassword(password);
}

function suffixOf(id: Types.ObjectId) {
  return id.toHexString().slice(8);
}

/** needs an open default connection. refuses a database with records it did not write, unless `reset` */
export async function runSeed(options: SeedOptions): Promise<CollectionResult[]> {
  await bootstrapDb();

  const now = new Date(Math.floor((options.now ?? new Date()).getTime() / MINUTE) * MINUTE);
  const records = buildRecords(now, await passwordHashFor(options.password));
  const recordsOf = (name: string): SeedDoc[] => records[name as keyof SeedRecords] ?? [];

  const seedIds = new Set<string>();
  const seedSuffixes = new Set<string>();
  for (const docs of Object.values(records) as SeedDoc[][]) {
    for (const doc of docs) {
      seedIds.add(doc._id.toHexString());
      seedSuffixes.add(suffixOf(doc._id));
    }
  }

  const foreign: string[] = [];
  const stale = new Map<string, Types.ObjectId[]>();
  for (const { model } of MANAGED) {
    const name = model.collection.collectionName;
    const ids: Types.ObjectId[] = await model.distinct('_id');
    const theirs = ids.filter((id) => !seedSuffixes.has(suffixOf(id)));
    if (theirs.length > 0) foreign.push(`${name} ${theirs.length}`);
    // a record from a run on an earlier day has the same name under a different creation time
    stale.set(
      name,
      ids.filter((id) => seedSuffixes.has(suffixOf(id)) && !seedIds.has(id.toHexString())),
    );
  }

  if (foreign.length > 0 && !options.reset) {
    throw new SeedRefusedError(
      `the database holds records the seed did not write (${foreign.join(', ')}). Nothing was changed. Pass --reset to delete them and seed from empty`,
    );
  }

  const results: CollectionResult[] = [];
  for (const { model } of MANAGED) {
    const name = model.collection.collectionName;
    const deleted = options.reset
      ? await model.deleteMany({})
      : await model.deleteMany({ _id: { $in: stale.get(name) ?? [] } });

    const docs = recordsOf(name);
    const result: CollectionResult = {
      name,
      total: docs.length,
      inserted: 0,
      updated: 0,
      deleted: deleted.deletedCount,
    };
    if (docs.length > 0) {
      const replacements = [];
      for (const data of docs) {
        // the Mongoose rules run here, and the collection validator runs again on the write
        const doc = new model(data);
        await doc.validate();
        // MongoDB stores `_id` first, and a replacement in another field order counts as a change
        const { _id, ...fields } = doc.toObject();
        replacements.push({
          replaceOne: { filter: { _id }, replacement: { _id, ...fields }, upsert: true },
        });
      }
      const written = await model.collection.bulkWrite(replacements);
      result.inserted = written.upsertedCount;
      result.updated = written.modifiedCount;
    }
    results.push(result);
  }

  if (options.reset) {
    await mongoose.connection.collection(SESSIONS_COLLECTION).deleteMany({});
  }
  return results;
}
