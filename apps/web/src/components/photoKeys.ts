/* SPLIT FROM FoodPhoto.tsx FOR FAST REFRESH COMPAT */

import type { StringKey } from '../i18n/strings';

export type PhotoKey = 'bread' | 'produce' | 'dairy' | 'prepared' | 'dry' | 'mixed';

export const photoKeys: PhotoKey[] = ['bread', 'produce', 'dairy', 'prepared', 'dry', 'mixed'];

export const photoLabelKeys: Record<PhotoKey, StringKey> = {
  bread: 'photo.bread',
  produce: 'photo.produce',
  dairy: 'photo.dairy',
  prepared: 'photo.prepared',
  dry: 'photo.dry',
  mixed: 'photo.mixed',
};
