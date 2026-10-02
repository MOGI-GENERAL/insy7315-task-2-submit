import mongoose, { type ClientSession } from 'mongoose';

/** commits every write made with the session, or none of them */
export function runInTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work);
}
