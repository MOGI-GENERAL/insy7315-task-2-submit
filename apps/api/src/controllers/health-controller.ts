import type { Request, Response } from 'express';
import type { HealthService } from '../services/health-service.js';

export function healthController(healthService: HealthService) {
  return {
    async get(_req: Request, res: Response) {
      res.json(await healthService.check());
    },
  };
}
