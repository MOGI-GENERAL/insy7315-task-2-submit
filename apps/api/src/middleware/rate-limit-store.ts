import type { Options, Store } from 'express-rate-limit';
import { RateLimitRepository } from '../db/index.js';

/** builds one store per limiter, since express-rate-limit refuses a store shared between two */
export type RateLimitStoreFactory = (limiter: string) => Store;

export class MongoRateLimitStore implements Store {
  readonly prefix: string;
  readonly localKeys = false;
  private windowMs = 0;
  private readonly repository: RateLimitRepository;

  constructor(limiter: string, repository = new RateLimitRepository()) {
    this.prefix = `${limiter}:`;
    this.repository = repository;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string) {
    const { hits, resetAt } = await this.repository.hit(this.prefix + key, this.windowMs);
    return { totalHits: hits, resetTime: resetAt };
  }

  async decrement(key: string) {
    await this.repository.undo(this.prefix + key);
  }

  async resetKey(key: string) {
    await this.repository.reset(this.prefix + key);
  }
}

export const mongoRateLimitStores: RateLimitStoreFactory = (limiter) =>
  new MongoRateLimitStore(limiter);
