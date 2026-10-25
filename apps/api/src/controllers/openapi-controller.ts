import type { Request, Response } from 'express';
import type { OpenApiService } from '../services/openapi-service.js';

export function openApiController(openApiService: OpenApiService) {
  return {
    get(_req: Request, res: Response) {
      res.json(openApiService.get());
    },
  };
}
