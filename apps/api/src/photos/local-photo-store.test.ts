import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LocalPhotoStore } from './local-photo-store.js';

it('removes a stored photo and tolerates one that is already gone', async () => {
  const store = new LocalPhotoStore(await mkdtemp(join(tmpdir(), 'photos-')));
  const { url } = await store.put(Buffer.from('x'), 'image/png');
  expect(await readdir(store.directory)).toHaveLength(1);
  await store.delete(url);
  await store.delete(url);
  expect(await readdir(store.directory)).toHaveLength(0);
});
