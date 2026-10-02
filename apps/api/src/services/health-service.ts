import type { HealthResponse } from '@fedsa/contract';
import type { HealthRepository } from '../db/index.js';

export class HealthService {
  private readonly repository: HealthRepository;
  /** the deployed git commit, so the deploy pipeline can tell when a new build is live */
  private readonly version: string;

  constructor(repository: HealthRepository, version: string) {
    this.repository = repository;
    this.version = version;
  }

  async check(): Promise<HealthResponse> {
    const up = await this.repository.isDatabaseUp();
    return { ok: true, version: this.version, db: up ? 'up' : 'down' };
  }
}
