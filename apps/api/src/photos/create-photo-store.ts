import { CloudinaryPhotoStore, cloudinaryUploader } from './cloudinary-photo-store.js';
import { LocalPhotoStore } from './local-photo-store.js';
import type { PhotoStore } from './photo-store.js';

/** throws a message fit for the start-up log */
export function createPhotoStore(env: NodeJS.ProcessEnv): PhotoStore {
  const kind = env.PHOTO_STORE || 'local';
  if (kind === 'local') return new LocalPhotoStore();
  if (kind !== 'cloudinary') throw new Error('PHOTO_STORE must be local or cloudinary');
  if (!env.CLOUDINARY_URL) throw new Error('PHOTO_STORE=cloudinary needs CLOUDINARY_URL');
  return new CloudinaryPhotoStore(cloudinaryUploader(), env.CLOUDINARY_FOLDER || 'fedsa');
}
