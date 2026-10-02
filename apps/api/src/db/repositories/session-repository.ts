import mongoose from 'mongoose';

/** the session store owns this collection and its expiry index, so `bootstrapDb` leaves it alone */
export const SESSIONS_COLLECTION = 'sessions';

interface StoredSession {
  _id: string;
  session: { userId?: string };
}

export class SessionRepository {
  deleteForUser(userId: string, exceptSessionId?: string) {
    const filter = exceptSessionId
      ? { 'session.userId': userId, _id: { $ne: exceptSessionId } }
      : { 'session.userId': userId };
    return mongoose.connection.collection<StoredSession>(SESSIONS_COLLECTION).deleteMany(filter);
  }
}
