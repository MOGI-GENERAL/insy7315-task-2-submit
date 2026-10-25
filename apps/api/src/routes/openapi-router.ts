import { Router } from 'express';
import { openApiController } from '../controllers/openapi-controller.js';
import type { OpenApiService } from '../services/openapi-service.js';

export function openApiRouter(openApiService: OpenApiService) {
  const controller = openApiController(openApiService);
  const router = Router();
  router.get('/openapi.json', controller.get);
  return router;
}
