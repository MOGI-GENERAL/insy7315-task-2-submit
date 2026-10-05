import { v2 as cloudinary } from 'cloudinary';
import type { PhotoStore, StoredPhoto } from './photo-store.js';

export interface UploadedImage {
  public_id: string;
  secure_url: string;
}

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

export class CloudinaryPhotoStore implements PhotoStore {
  private readonly upload: Uploader;
  private readonly folder: string;

  constructor(upload: Uploader, folder: string) {
    this.upload = upload;
    this.folder = folder;
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
}
