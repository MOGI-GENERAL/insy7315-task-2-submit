import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { PhotoMime, PhotoStore, StoredPhoto } from './photo-store.js';

/**
 * the `.invalid` domain never resolves, so these URLs pass the https rule in the
 * database while making it plain that nothing serves them
 */
export const LOCAL_PHOTO_BASE_URL = 'https://local-photos.invalid';

const EXTENSIONS: Record<PhotoMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** keeps photos on disk for development and tests, outside the repository by default */
export class LocalPhotoStore implements PhotoStore {
  readonly directory: string;

  constructor(directory = join(tmpdir(), 'fedsa-photos')) {
    this.directory = directory;
  }

  async put(buffer: Buffer, mime: PhotoMime): Promise<StoredPhoto> {
    const publicId = randomUUID();
    const fileName = `${publicId}.${EXTENSIONS[mime]}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, fileName), buffer);
    return { publicId, url: `${LOCAL_PHOTO_BASE_URL}/${fileName}` };
  }

  thumbnailUrl(url: string) {
    return url.replace(`${LOCAL_PHOTO_BASE_URL}/`, `${LOCAL_PHOTO_BASE_URL}/thumb/`);
  }

  fullSizeUrl(url: string) {
    return url;
  }

  async delete(url: string) {
    await rm(join(this.directory, basename(url)), { force: true });
  }
}
