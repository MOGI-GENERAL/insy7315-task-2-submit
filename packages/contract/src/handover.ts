import { z } from 'zod';
import { e164Phone, isoDateTime, longText, quantityKgField } from './common.js';
import { Collection, Handover, Offer, OrganisationSummary } from './entities.js';
import { Condition } from './enums.js';

export const DispatchRequest = z.object({
  driverName: z.string().trim().min(2).max(120),
  driverPhone: e164Phone,
  scheduledFor: isoDateTime,
});
export type DispatchRequest = z.infer<typeof DispatchRequest>;

export const UpdateCollectionRequest = z.object({ status: z.enum(['completed', 'cancelled']) });
export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequest>;

export const CollectionResponse = z.object({ collection: Collection });
export type CollectionResponse = z.infer<typeof CollectionResponse>;

/** text field of the multipart donor-confirm. the photo goes as the `photo` file part */
export const DonorConfirmFields = z.object({ collectedQuantityKg: quantityKgField });
export type DonorConfirmFields = z.infer<typeof DonorConfirmFields>;

/** `remainderOffer` is set when less than the offered quantity was collected */
export const DonorConfirmResponse = z.object({
  handover: Handover,
  remainderOffer: Offer.nullable(),
});
export type DonorConfirmResponse = z.infer<typeof DonorConfirmResponse>;

export const RecipientConfirmRequest = z
  .object({
    conditionOnReceipt: Condition,
    conditionNotes: longText.optional(),
  })
  .refine((b) => b.conditionOnReceipt !== 'problem' || !!b.conditionNotes, {
    path: ['conditionNotes'],
    message: 'Say what was wrong',
  });
export type RecipientConfirmRequest = z.infer<typeof RecipientConfirmRequest>;

export const RecipientConfirmResponse = z.object({ handover: Handover, offer: Offer });
export type RecipientConfirmResponse = z.infer<typeof RecipientConfirmResponse>;

export const ListHandoversQuery = z.object({
  condition: Condition.optional(),
  resolved: z.stringbool().optional(),
});
export type ListHandoversQuery = z.infer<typeof ListHandoversQuery>;

export const HandoverListItem = Handover.extend({ offer: Offer, recipient: OrganisationSummary });
export type HandoverListItem = z.infer<typeof HandoverListItem>;

export const HandoverListResponse = z.object({ items: z.array(HandoverListItem) });
export type HandoverListResponse = z.infer<typeof HandoverListResponse>;

export const ResolutionRequest = z.object({ resolutionNote: longText.min(1) });
export type ResolutionRequest = z.infer<typeof ResolutionRequest>;

export const HandoverResponse = z.object({ handover: Handover });
export type HandoverResponse = z.infer<typeof HandoverResponse>;
