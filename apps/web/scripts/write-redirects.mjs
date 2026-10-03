// Netlify cannot vary redirects by deploy context. each build writes its own from API_ORIGIN
import { writeFileSync } from 'node:fs';

const origin = process.env.API_ORIGIN?.trim().replace(/\/+$/, '');
const lines = [];

if (origin) {
  if (!origin.startsWith('https://')) {
    console.error(`API_ORIGIN must be an https URL, got ${origin}`);
    process.exit(1);
  }
  lines.push(`/api/*  ${origin}/api/:splat  200!`);
} else {
  console.warn('API_ORIGIN is not set, so this build does not proxy /api');
}

lines.push('/*  /index.html  200');

writeFileSync(new URL('../dist/_redirects', import.meta.url), `${lines.join('\n')}\n`);
