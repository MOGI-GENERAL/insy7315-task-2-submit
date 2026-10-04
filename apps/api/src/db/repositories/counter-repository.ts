import type { ClientSession } from 'mongoose';
import { CounterModel } from '../models/counter.js';

export class CounterRepository {
  /**
   * the next number in `year`. the first is 1. only safe inside a transaction,
   * where a second caller writing the same counter gets a write conflict and retries
   */
  async next(name: string, year: number, session: ClientSession) {
    const current = await CounterModel.findOne({ name }, null, { session }).exec();
    const seq = current && current.year === year ? current.seq + 1 : 1;
    await CounterModel.updateOne(
      { name },
      { $set: { year, seq } },
      { upsert: true, runValidators: true, session },
    ).exec();
    return seq;
  }
}
