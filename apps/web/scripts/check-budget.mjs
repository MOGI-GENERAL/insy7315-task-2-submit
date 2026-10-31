// fails when a first visit to the recipient feed needs more than 500 KB of JavaScript and CSS.
// sizes are uncompressed, and the build is the HTTP one that deploys
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const LIMIT_BYTES = 500 * 1000;
const FEED_SCREENS = 'src/routes/recipient/screens.ts';
// a signed-in visit loads the shell as its own chunk
const SIGNED_IN_APP = 'src/SignedInApp.tsx';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = new URL('../dist/', import.meta.url);

process.env.VITE_DATA = 'http';
await build({ root, logLevel: 'warn', build: { manifest: true } });

const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', dist), 'utf8'));
const files = new Set();
const seen = new Set();

// dynamic imports are left out, because the feed never loads the other roles' screens
function collect(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`the build manifest has no entry for ${key}`);
  files.add(chunk.file);
  for (const css of chunk.css ?? []) files.add(css);
  for (const imported of chunk.imports ?? []) collect(imported);
}

collect('index.html');
collect(SIGNED_IN_APP);
collect(FEED_SCREENS);

let total = 0;
for (const file of [...files].sort()) {
  const size = statSync(new URL(file, dist)).size;
  total += size;
  console.log(`${(size / 1000).toFixed(1).padStart(8)} KB  ${file}`);
}

const summary = `recipient feed: ${(total / 1000).toFixed(1)} KB of ${LIMIT_BYTES / 1000} KB`;
if (total > LIMIT_BYTES) {
  console.error(`${summary}. over budget`);
  process.exit(1);
}
console.log(summary);
