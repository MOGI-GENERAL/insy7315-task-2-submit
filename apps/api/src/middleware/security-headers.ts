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
