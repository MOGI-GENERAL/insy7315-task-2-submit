import { z } from 'zod';
import { isoDateTime, isoDay, longText, quantityKgField } from './common.js';
import { Claim, Collection, DonorContact, Handover, Offer } from './entities.js';
import { ColdChain, FoodCategory, OfferStatus } from './enums.js';

export const MAX_PHOTOS_PER_OFFER = 2;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** text fields of the multipart `POST /api/offers`. photos go as `photos[]` file parts */
export const PostOfferFields = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: longText.optional(),
    category: FoodCategory,
    offeredQuantityKg: quantityKgField,
    coldChain: ColdChain,
    availableFrom: isoDateTime.optional(),
    collectionDeadline: isoDateTime,
  })
  .superRefine((o, ctx) => {
    const deadline = Date.parse(o.collectionDeadline);
    if (deadline <= Date.now()) {
      ctx.addIssue({
        code: 'custom',
        path: ['collectionDeadline'],
        message: 'Must be in the future',
      });
    } else if (o.availableFrom && deadline <= Date.parse(o.availableFrom)) {
      ctx.addIssue({
        code: 'custom',
        path: ['collectionDeadline'],
        message: 'Must be after the available time',
      });
    }
  });
export type PostOfferFields = z.infer<typeof PostOfferFields>;

export const PostOfferResponse = z.object({
  offer: Offer,
  notifiedCount: z.number().int(),
});
export type PostOfferResponse = z.infer<typeof PostOfferResponse>;

export const OfferView = z.enum(['feed', 'scheduled', 'mine', 'all']);
export type OfferView = z.infer<typeof OfferView>;

export const ListOffersQuery = z.object({
  view: OfferView,
  status: OfferStatus.optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  cursor: z.string().max(200).optional(),
});
export type ListOffersQuery = z.infer<typeof ListOffersQuery>;

export const OfferListResponse = z.object({
  items: z.array(Offer),
  nextCursor: z.string().nullable(),
});
export type OfferListResponse = z.infer<typeof OfferListResponse>;

export const OfferDetailResponse = z.object({
  offer: Offer,
  claim: Claim.nullable(),
  collection: Collection.nullable(),
  handover: Handover.nullable(),
});
export type OfferDetailResponse = z.infer<typeof OfferDetailResponse>;

export const OfferResponse = z.object({ offer: Offer });
export type OfferResponse = z.infer<typeof OfferResponse>;

export const CancelOfferRequest = z.object({ reason: longText.optional() });
export type CancelOfferRequest = z.infer<typeof CancelOfferRequest>;

export const ClaimRequest = z.object({ transportNeeded: z.boolean() });
export type ClaimRequest = z.infer<typeof ClaimRequest>;

export const ClaimResponse = z.object({
  claim: Claim,
  donorContact: DonorContact,
});
export type ClaimResponse = z.infer<typeof ClaimResponse>;
