import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { HandoverRecordModel, HandoverRepository } from '../../src/db/index.js';
import type { PhotoStore } from '../../src/photos/photo-store.js';
import { RetentionService } from '../../src/services/retention-service.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);

class RecordingStore implements PhotoStore {
  deleted: string[] = [];
  failFor = new Set<string>();
  async put(): Promise<never> {
    throw new Error('not used');
  }
  thumbnailUrl = (url: string) => url;
  fullSizeUrl = (url: string) => url;
  async delete(url: string) {
    if (this.failFor.has(url)) throw new Error('store down');
    this.deleted.push(url);
  }
}

const store = new RecordingStore();
const retention = new RetentionService(new HandoverRepository(), store);
let stopTestDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopTestDb = await startTestDb();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await stopTestDb?.();
});

beforeEach(async () => {
  store.deleted = [];
  store.failFor.clear();
  await HandoverRecordModel.deleteMany({});
});

function createHandover(retainUntil: Date, donorPhotoUrl: string | null) {
  return HandoverRecordModel.create({
    claimId: new Types.ObjectId(),
    offerId: new Types.ObjectId(),
    donorConfirmedByUserId: new Types.ObjectId(),
    donorConfirmedAt: daysFromNow(-800),
    collectedQuantityKg: 10,
    donorPhotoUrl,
    retainUntil,
  });
}

const photoOf = async (id: Types.ObjectId) =>
  (await HandoverRecordModel.findById(id))?.donorPhotoUrl;

describe('retention sweep', () => {
  test('deletes photos past retention and keeps the record', async () => {
    const due = await createHandover(daysFromNow(-1), 'https://example.com/due.jpg');
    const kept = await createHandover(daysFromNow(30), 'https://example.com/kept.jpg');

    const summary = await retention.sweep();

    expect(summary).toEqual({ photosDeleted: 1, failed: 0 });
    expect(store.deleted).toEqual(['https://example.com/due.jpg']);
    expect(await photoOf(due._id)).toBeNull();
    expect(await photoOf(kept._id)).toBe('https://example.com/kept.jpg');
    expect(await HandoverRecordModel.countDocuments({})).toBe(2);
  });

  test('does nothing the second time and ignores records without a photo', async () => {
    await createHandover(daysFromNow(-1), 'https://example.com/due.jpg');
    await createHandover(daysFromNow(-1), null);

    await retention.sweep();
    const again = await retention.sweep();

    expect(again).toEqual({ photosDeleted: 0, failed: 0 });
    expect(store.deleted).toHaveLength(1);
  });

  test('keeps the url when the store fails, so the next run tries again', async () => {
    const stuck = await createHandover(daysFromNow(-1), 'https://example.com/stuck.jpg');
    store.failFor.add('https://example.com/stuck.jpg');

    expect(await retention.sweep()).toEqual({ photosDeleted: 0, failed: 1 });
    expect(await photoOf(stuck._id)).toBe('https://example.com/stuck.jpg');

    store.failFor.clear();
    expect(await retention.sweep()).toEqual({ photosDeleted: 1, failed: 0 });
    expect(await photoOf(stuck._id)).toBeNull();
  });
});
