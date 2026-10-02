import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors.js';

export interface RequestSchemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

/**
 * parses each part of the request with its contract schema and replaces it
 * with the parsed copy, so unknown keys are gone before a controller sees it
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const fields: Record<string, string> = {};

    function parse(part: keyof RequestSchemas, value: unknown): unknown {
      const result = schemas[part]!.safeParse(value);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.') || part;
        fields[key] ??= issue.message;
      }
      return value;
    }

    if (schemas.params) req.params = parse('params', req.params) as Request['params'];
    if (schemas.query) {
      // Express 5 exposes `query` through a getter, so it cannot be assigned
      Object.defineProperty(req, 'query', {
        value: parse('query', req.query),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (schemas.body) req.body = parse('body', req.body);

    if (Object.keys(fields).length > 0) {
      next(new ValidationError(fields));
      return;
    }
    next();
  };
}
