import { v2 as cloudinary } from 'cloudinary';
import type { PhotoStore, StoredPhoto } from './photo-store.js';

export interface UploadedImage {
  public_id: string;
  secure_url: string;
}

export type Destroyer = (publicId: string) => Promise<void>;

/** takes the account from `CLOUDINARY_URL`. tests pass a fake */
export type Uploader = (buffer: Buffer, folder: string) => Promise<UploadedImage>;

const THUMBNAIL = 'c_limit,w_400,h_400,q_auto,f_auto';

export function cloudinaryUploader(): Uploader {
  return (buffer, folder) =>
    new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (err, result) => {
          if (err || !result) reject(err ?? new Error('Cloudinary returned no result'));
          else resolve(result);
        },
      );
      stream.end(buffer);
    });
}

export function cloudinaryDestroyer(): Destroyer {
  return async (publicId) => {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  };
}

/** drops the transformation and version segments and the extension */
export function publicIdFromUrl(url: string): string | null {
  const path = url.split('/image/upload/')[1];
  if (!path) return null;
  const segments = path.split('/');
  const version = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const id = segments.slice(version + 1).join('/');
  return id.replace(/\.[a-z0-9]+$/i, '') || null;
}

export class CloudinaryPhotoStore implements PhotoStore {
  private readonly upload: Uploader;
  private readonly folder: string;
  private readonly destroy: Destroyer;

  constructor(upload: Uploader, folder: string, destroy: Destroyer = async () => {}) {
    this.upload = upload;
    this.folder = folder;
    this.destroy = destroy;
  }

  async put(buffer: Buffer): Promise<StoredPhoto> {
    const image = await this.upload(buffer, this.folder);
    return { publicId: image.public_id, url: image.secure_url };
  }

  thumbnailUrl(url: string) {
    return url.replace('/image/upload/', `/image/upload/${THUMBNAIL}/`);
  }

  fullSizeUrl(url: string) {
    return url;
  }

  async delete(url: string) {
    const publicId = publicIdFromUrl(url);
    if (publicId) await this.destroy(publicId);
  }
}
