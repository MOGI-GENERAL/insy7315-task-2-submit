import mongoose from 'mongoose';

export class HealthRepository {
  async isDatabaseUp(): Promise<boolean> {
    const db = mongoose.connection.db;
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) return false;
    try {
      await db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
