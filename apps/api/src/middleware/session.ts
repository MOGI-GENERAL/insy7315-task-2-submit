import { MongoStore } from 'connect-mongo';
import type { Request, Response } from 'express';
import session, { type Store } from 'express-session';
import mongoose from 'mongoose';
import { SESSIONS_COLLECTION } from '../db/index.js';

declare module 'express-session' {
  interface SessionData {
    /** a hex string, so the store can be queried for every session one user holds */
    userId: string;
    csrfToken: string;
  }
}

export const SESSION_COOKIE = 'fedsa.sid';

/** a session ends after 12 hours without a request */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionSettings {
  secret: string;
  /** false only where the API is served over plain http, locally and in tests */
  secureCookie: boolean;
  /** without one, express-session keeps sessions in memory, which only tests should do */
  store?: Store;
}

export function sessions(settings: SessionSettings) {
  return session({
    name: SESSION_COOKIE,
    secret: settings.secret,
    store: settings.store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: settings.secureCookie,
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS * 1000,
    },
  });
}

type StoreClient = NonNullable<Parameters<typeof MongoStore.create>[0]['client']>;

/**
 * keeps sessions in MongoDB over the open mongoose connection. sessions are
 * stored as objects rather than JSON strings so `session.userId` can be queried
 */
export async function createSessionStore() {
  const store = MongoStore.create({
    // mongoose ships its own copy of the driver, so its client type differs from the store's
    client: mongoose.connection.getClient() as unknown as StoreClient,
    collectionName: SESSIONS_COLLECTION,
    stringify: false,
    ttl: SESSION_TTL_SECONDS,
  });
  // the store builds its expiry index in the background. a failure there would
  // otherwise surface later as an unhandled rejection, even after a disconnect
  await store.collectionP;
  return store;
}

/** a new session ID on every sign-in stops a session fixed before it from being reused */
export async function signIn(req: Request, userId: string) {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.userId = userId;
}

export async function signOut(req: Request, res: Response) {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie(SESSION_COOKIE);
}
