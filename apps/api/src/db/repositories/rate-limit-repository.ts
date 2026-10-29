import { RateLimitModel } from '../models/rate-limit.js';

export class RateLimitRepository {
  /** the first hit after a window ends starts a new one */
  async hit(key: string, windowMs: number, now = new Date()) {
    const open = { $gt: ['$resetAt', now] };
    const doc = await RateLimitModel.collection.findOneAndUpdate(
      { _id: key as never },
      [
        {
          $set: {
            hits: { $cond: [open, { $add: ['$hits', 1] }, 1] },
            resetAt: { $cond: [open, '$resetAt', new Date(now.getTime() + windowMs)] },
          },
        },
      ],
      { upsert: true, returnDocument: 'after' },
    );
    return { hits: doc!.hits as number, resetAt: doc!.resetAt as Date };
  }

  async undo(key: string) {
    await RateLimitModel.updateOne({ _id: key, hits: { $gt: 0 } }, { $inc: { hits: -1 } }).exec();
  }

  async reset(key: string) {
    await RateLimitModel.deleteOne({ _id: key }).exec();
  }
}
