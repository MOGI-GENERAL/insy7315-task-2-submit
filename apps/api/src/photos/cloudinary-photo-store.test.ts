import { describe, expect, it } from 'vitest';
import { CloudinaryPhotoStore } from './cloudinary-photo-store.js';
import { createPhotoStore } from './create-photo-store.js';
import { LocalPhotoStore } from './local-photo-store.js';

const URL = 'https://res.cloudinary.com/demo/image/upload/v1/fedsa/staging/abc.jpg';

describe('CloudinaryPhotoStore', () => {
  it('uploads into its folder and returns the delivery url', async () => {
    const calls: string[] = [];
    const store = new CloudinaryPhotoStore(async (_buffer, folder) => {
      calls.push(folder);
      return { public_id: 'fedsa/staging/abc', secure_url: URL };
    }, 'fedsa/staging');
    const stored = await store.put(Buffer.from('x'));
    expect(stored).toEqual({ publicId: 'fedsa/staging/abc', url: URL });
    expect(calls).toEqual(['fedsa/staging']);
  });

  it('derives a small thumbnail and leaves the full size alone', () => {
    const store = new CloudinaryPhotoStore(async () => ({ public_id: '', secure_url: '' }), 'f');
    expect(store.thumbnailUrl(URL)).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_400,h_400,q_auto,f_auto/v1/fedsa/staging/abc.jpg',
    );
    expect(store.fullSizeUrl(URL)).toBe(URL);
  });

  it('passes a plain url through when there is nothing to transform', () => {
    const store = new CloudinaryPhotoStore(async () => ({ public_id: '', secure_url: '' }), 'f');
    expect(store.thumbnailUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});

describe('createPhotoStore', () => {
  it('defaults to local photos', () => {
    expect(createPhotoStore({})).toBeInstanceOf(LocalPhotoStore);
  });

  it('builds the Cloudinary store when it has an account', () => {
    const env = { PHOTO_STORE: 'cloudinary', CLOUDINARY_URL: 'cloudinary://k:s@demo' };
    expect(createPhotoStore(env)).toBeInstanceOf(CloudinaryPhotoStore);
  });

  it('refuses Cloudinary without an account', () => {
    expect(() => createPhotoStore({ PHOTO_STORE: 'cloudinary' })).toThrow('CLOUDINARY_URL');
  });

  it('refuses an unknown store', () => {
    expect(() => createPhotoStore({ PHOTO_STORE: 's3' })).toThrow('local or cloudinary');
  });
});
