import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from '@fedsa/contract';
import { fileTypeFromBuffer } from 'file-type';
import { UploadRejectedError } from '../errors.js';
import type { PhotoMime } from './photo-store.js';

/** what the upload middleware hands over for each file */
export interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

export interface CheckedPhoto {
  buffer: Buffer;
  mime: PhotoMime;
}

function isPhotoMime(mime: string | undefined): mime is PhotoMime {
  return PHOTO_MIME_TYPES.some((allowed) => allowed === mime);
}

/** the type comes from the file's first bytes, because the client can declare anything */
export async function checkPhotos(files: UploadedPhoto[], max: number): Promise<CheckedPhoto[]> {
  if (files.length > max) throw new UploadRejectedError(`Attach at most ${max} photos`);

  const checked: CheckedPhoto[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) {
      throw new UploadRejectedError('Each photo must be 5 MB or smaller');
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!isPhotoMime(detected?.mime)) {
      throw new UploadRejectedError('Photos must be JPEG, PNG or WebP images');
    }
    checked.push({ buffer: file.buffer, mime: detected.mime });
  }
  return checked;
}
