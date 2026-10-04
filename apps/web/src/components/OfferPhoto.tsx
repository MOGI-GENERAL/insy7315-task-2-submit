import { useState } from 'react';
import type { Photo } from '@fedsa/contract';
import { photoKeyFromUrl } from '../data';
import { FoodPhoto } from './FoodPhoto';

/** demo data has illustration keys in place of real images */
export function OfferPhoto({
  photos,
  alt,
  full = false,
  className,
}: {
  photos: readonly Photo[];
  alt: string;
  /** only detail responses include the full image (NFR03) */
  full?: boolean;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photo = photos[0];
  const src = photo && (full ? (photo.url ?? photo.thumbUrl) : photo.thumbUrl);
  const key = photoKeyFromUrl(src);

  if (!src || key || src === failedSrc) return <FoodPhoto photo={key} className={className} />;
  return (
    <img
      src={src}
      alt={alt}
      className={`foodphoto foodphoto--img ${className ?? ''}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
