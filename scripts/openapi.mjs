import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serialiseOpenApi } from '../packages/contract/dist/index.js';

const file = fileURLToPath(new URL('../docs/openapi.json', import.meta.url));
const fresh = serialiseOpenApi();

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    // a missing file counts as drift
  }
  if (committed !== fresh) {
    console.error('docs/openapi.json is out of date, run npm run openapi');
    process.exit(1);
  }
} else {
  writeFileSync(file, fresh);
}
