import { Router } from 'express';
import { healthController } from '../controllers/health-controller.js';
import type { HealthService } from '../services/health-service.js';

export function healthRouter(healthService: HealthService) {
  const controller = healthController(healthService);
  const router = Router();
  router.get('/health', controller.get);
  return router;
}
