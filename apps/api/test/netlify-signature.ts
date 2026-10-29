import { createHmac } from 'node:crypto';

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** the `x-nf-sign` token Netlify's signed rewrite sends, with claims a test can override */
export function netlifySignature(
  secret: string,
  claims: Record<string, unknown> = {},
  alg = 'HS256',
) {
  const header = encode({ alg, typ: 'JWT' });
  const payload = encode({
    deploy_context: 'production',
    exp: Math.floor(Date.now() / 1000) + 60,
    iss: 'netlify',
    site_url: 'https://fedsa.example.org',
    ...claims,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
