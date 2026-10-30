// Netlify cannot vary redirects by deploy context, and a signed rewrite must be in netlify.toml
// with the SPA fallback after it. only CI sets API_ORIGIN, on a throwaway checkout
import { readFileSync, writeFileSync } from 'node:fs';

const origin = process.env.API_ORIGIN?.trim().replace(/\/+$/, '');
const config = new URL('../../../netlify.toml', import.meta.url);
const MARKER = '# written by apps/web/scripts/write-redirects.mjs';

if (!origin) {
  console.warn('API_ORIGIN is not set, so this build does not proxy /api');
  writeFileSync(new URL('../dist/_redirects', import.meta.url), '/*  /index.html  200\n');
  process.exit(0);
}

if (!origin.startsWith('https://')) {
  console.error(`API_ORIGIN must be an https URL, got ${origin}`);
  process.exit(1);
}

// Netlify signs each proxied request with the value of the variable named in `signed`
const rules = `${MARKER}
[[redirects]]
  from = "/api/*"
  to = "${origin}/api/:splat"
  status = 200
  force = true
  signed = "API_PROXY_SECRET"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;

const current = readFileSync(config, 'utf8');
const kept = current.includes(MARKER) ? current.slice(0, current.indexOf(MARKER)) : current;
writeFileSync(config, `${kept.trimEnd()}\n\n${rules}`);
