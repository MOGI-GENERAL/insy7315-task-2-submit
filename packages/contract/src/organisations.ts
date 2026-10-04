import { z } from 'zod';
import { longText } from './common.js';
import { DonorOrganisationInput, RecipientOrganisationInput } from './auth.js';
import { Organisation, OrganisationStats } from './entities.js';
import { OrganisationStatus, OrganisationType, VerificationDecision } from './enums.js';

/** the API picks the schema by the caller's organisation type, so the body has no discriminator */
export const UpdateDonorOrganisationRequest = DonorOrganisationInput.partial();
export type UpdateDonorOrganisationRequest = z.infer<typeof UpdateDonorOrganisationRequest>;

export const UpdateRecipientOrganisationRequest = RecipientOrganisationInput.partial().extend({
  maxCapacityKg: z.number().positive().max(5000).nullable().optional(),
  mealsPerDay: z.number().int().positive().max(100000).nullable().optional(),
});
export type UpdateRecipientOrganisationRequest = z.infer<typeof UpdateRecipientOrganisationRequest>;

export const OrganisationResponse = z.object({ organisation: Organisation });
export type OrganisationResponse = z.infer<typeof OrganisationResponse>;

export const ListOrganisationsQuery = z.object({
  type: OrganisationType.optional(),
  status: OrganisationStatus.optional(),
  q: z.string().trim().max(120).optional(),
});
export type ListOrganisationsQuery = z.infer<typeof ListOrganisationsQuery>;

export const OrganisationListResponse = z.object({
  items: z.array(Organisation),
  total: z.number().int(),
});
export type OrganisationListResponse = z.infer<typeof OrganisationListResponse>;

export const OrganisationDetailResponse = z.object({
  organisation: Organisation,
  stats: OrganisationStats,
});
export type OrganisationDetailResponse = z.infer<typeof OrganisationDetailResponse>;

export const VerificationRequest = z.object({
  decision: VerificationDecision,
  note: longText.optional(),
});
export type VerificationRequest = z.infer<typeof VerificationRequest>;

export const CapacityNotesRequest = z.object({ capacityNotes: longText });
export type CapacityNotesRequest = z.infer<typeof CapacityNotesRequest>;
