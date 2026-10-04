import type { PHOTO_MIME_TYPES } from '@fedsa/contract';

export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];

export interface StoredPhoto {
  publicId: string;
  /** the full-size image. the database keeps this URL and derives the others from it */
  url: string;
}

/**
 * where offer and handover photos are kept. browsers load the images straight
 * from the store, so the API only ever handles the upload
 */
export interface PhotoStore {
  put(buffer: Buffer, mime: PhotoMime): Promise<StoredPhoto>;
  /** small enough for lists, so browsing costs little data */
  thumbnailUrl(url: string): string;
  fullSizeUrl(url: string): string;
}
