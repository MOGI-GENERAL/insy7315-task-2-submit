import type { Offer, Photo } from '@fedsa/contract';
import { Types } from 'mongoose';
import type { ClaimRepository, OfferRepository, OrganisationRepository } from '../db/index.js';
import { NotFoundError } from '../errors.js';
import type { PhotoStore } from '../photos/photo-store.js';
import { offerView } from './views.js';

export type StoredOffer = NonNullable<Awaited<ReturnType<OfferRepository['findById']>>>;
export type StoredOrganisation = NonNullable<
  Awaited<ReturnType<OrganisationRepository['findById']>>
>;
export type StoredClaim = NonNullable<Awaited<ReturnType<ClaimRepository['findById']>>>;

export async function findOrganisation(
  organisations: OrganisationRepository,
  id: Types.ObjectId | string | null,
) {
  const organisation = id ? await organisations.findById(id) : null;
  if (!organisation) throw new NotFoundError();
  return organisation;
}

export async function donorsOf(organisations: OrganisationRepository, offers: StoredOffer[]) {
  const ids = [...new Set(offers.map((offer) => offer.donorOrganisationId.toString()))];
  const donors = await organisations.findByIds(ids.map((id) => new Types.ObjectId(id)));
  return new Map(donors.map((donor) => [donor._id.toString(), donor]));
}

export function toOfferView(
  store: PhotoStore,
  offer: StoredOffer,
  donor: StoredOrganisation,
  withFullSize: boolean,
): Offer {
  const photos: Photo[] = offer.photoUrls.map((url) =>
    withFullSize
      ? { thumbUrl: store.thumbnailUrl(url), url: store.fullSizeUrl(url) }
      : { thumbUrl: store.thumbnailUrl(url) },
  );
  return offerView(offer, donor, photos);
}
