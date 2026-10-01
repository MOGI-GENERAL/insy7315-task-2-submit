/* SPLIT FROM FoodPhoto.tsx FOR FAST REFRESH COMPAT */

export type PhotoKey = 'bread' | 'produce' | 'dairy' | 'prepared' | 'dry' | 'mixed';

export const photoKeys: PhotoKey[] = ['bread', 'produce', 'dairy', 'prepared', 'dry', 'mixed'];

export const photoLabels: Record<PhotoKey, string> = {
  bread: 'Bread and rolls',
  produce: 'Fruit and vegetables',
  dairy: 'Milk and yoghurt',
  prepared: 'Prepared meals in trays',
  dry: 'Tins and dry goods',
  mixed: 'A crate of mixed groceries',
};
