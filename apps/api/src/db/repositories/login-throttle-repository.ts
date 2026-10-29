import { LoginThrottleModel } from '../models/login-throttle.js';

export class LoginThrottleRepository {
  async isBlocked(key: string, now = new Date()) {
    return (
      (await LoginThrottleModel.exists({ _id: key, blockedUntil: { $gt: now } }).exec()) !== null
    );
  }

  /** returns the failures counted so far, this one included */
  async recordFailure(key: string, keepUntil: Date) {
    const doc = await LoginThrottleModel.findOneAndUpdate(
      { _id: key },
      { $inc: { failures: 1 }, $set: { expiresAt: keepUntil } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    )
      .lean()
      .exec();
    return doc.failures;
  }

  /** a slower request with a smaller count never shortens the delay */
  async blockUntil(key: string, until: Date) {
    await LoginThrottleModel.updateOne({ _id: key }, { $max: { blockedUntil: until } }).exec();
  }

  async clear(key: string) {
    await LoginThrottleModel.deleteOne({ _id: key }).exec();
  }
}
