import { z } from 'zod';
import type { GeoPoint } from './common.js';

/** approximate centroids. the API stores the suburb centroid as the location, so no geocoding is needed */
export const SUBURBS = [
  { name: 'Athlone', city: 'Cape Town', lat: -33.962, lng: 18.505 },
  { name: 'Bellville', city: 'Cape Town', lat: -33.9, lng: 18.629 },
  { name: 'Bo-Kaap', city: 'Cape Town', lat: -33.92, lng: 18.415 },
  { name: 'Bonteheuwel', city: 'Cape Town', lat: -33.95, lng: 18.55 },
  { name: 'Cape Town CBD', city: 'Cape Town', lat: -33.925, lng: 18.424 },
  { name: 'Claremont', city: 'Cape Town', lat: -33.981, lng: 18.465 },
  { name: 'Delft', city: 'Cape Town', lat: -33.97, lng: 18.64 },
  { name: 'District Six', city: 'Cape Town', lat: -33.931, lng: 18.432 },
  { name: 'Elsies River', city: 'Cape Town', lat: -33.92, lng: 18.58 },
  { name: 'Gardens', city: 'Cape Town', lat: -33.935, lng: 18.411 },
  { name: 'Goodwood', city: 'Cape Town', lat: -33.91, lng: 18.55 },
  { name: 'Green Point', city: 'Cape Town', lat: -33.907, lng: 18.408 },
  { name: 'Gugulethu', city: 'Cape Town', lat: -33.98, lng: 18.57 },
  { name: 'Hout Bay', city: 'Cape Town', lat: -34.043, lng: 18.357 },
  { name: 'Kenilworth', city: 'Cape Town', lat: -33.995, lng: 18.47 },
  { name: 'Khayelitsha', city: 'Cape Town', lat: -34.04, lng: 18.68 },
  { name: 'Langa', city: 'Cape Town', lat: -33.945, lng: 18.53 },
  { name: 'Lansdowne', city: 'Cape Town', lat: -33.99, lng: 18.5 },
  { name: 'Maitland', city: 'Cape Town', lat: -33.923, lng: 18.488 },
  { name: 'Masiphumelele', city: 'Cape Town', lat: -34.13, lng: 18.373 },
  { name: 'Milnerton', city: 'Cape Town', lat: -33.87, lng: 18.5 },
  { name: 'Mitchells Plain', city: 'Cape Town', lat: -34.05, lng: 18.62 },
  { name: 'Mowbray', city: 'Cape Town', lat: -33.947, lng: 18.476 },
  { name: 'Muizenberg', city: 'Cape Town', lat: -34.108, lng: 18.47 },
  { name: 'Nyanga', city: 'Cape Town', lat: -33.988, lng: 18.58 },
  { name: 'Observatory', city: 'Cape Town', lat: -33.938, lng: 18.472 },
  { name: 'Parow', city: 'Cape Town', lat: -33.9, lng: 18.59 },
  { name: 'Philippi', city: 'Cape Town', lat: -34.01, lng: 18.58 },
  { name: 'Pinelands', city: 'Cape Town', lat: -33.937, lng: 18.51 },
  { name: 'Retreat', city: 'Cape Town', lat: -34.06, lng: 18.48 },
  { name: 'Rondebosch', city: 'Cape Town', lat: -33.96, lng: 18.47 },
  { name: 'Salt River', city: 'Cape Town', lat: -33.93, lng: 18.462 },
  { name: 'Sea Point', city: 'Cape Town', lat: -33.915, lng: 18.39 },
  { name: 'Table View', city: 'Cape Town', lat: -33.82, lng: 18.49 },
  { name: 'Woodstock', city: 'Cape Town', lat: -33.928, lng: 18.447 },
  { name: 'Wynberg', city: 'Cape Town', lat: -34.003, lng: 18.469 },
] as const;

export type SuburbInfo = (typeof SUBURBS)[number];

export const Suburb = z.enum(
  SUBURBS.map((s) => s.name) as [SuburbInfo['name'], ...SuburbInfo['name'][]],
);
export type Suburb = z.infer<typeof Suburb>;

export function suburbLocation(name: Suburb): GeoPoint {
  const s = SUBURBS.find((x) => x.name === name)!;
  return { type: 'Point', coordinates: [s.lng, s.lat] };
}
