import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'https://res.cloudinary.com', 'data:'],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
      },
    },
  });
}

/** the token is in the path. nothing may cache the response, index it or send it in a referrer */
export function driverLinkHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
  });
  next();
}
